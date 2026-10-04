// AgentRunner: the provider-agnostic tool-use loop for one crew member.
//
// It owns a normalized conversation history and asks the provider for the next
// step. A step is either a refusal, or some reasoning plus zero or more tool
// calls. Tool calls run through the AgentSession (budget + milestones); the
// special `submit` tool is judged by the Race via onSubmit. The loop ends on a
// correct submission, a refusal, budget exhaustion, the race being won by
// someone else (shouldStop), or the step cap.
//
// Normalized message shapes (what a provider adapter translates to its SDK):
//   { role:'system'|'user', text }
//   { role:'assistant', text?, toolCalls?:[{id,name,args}] }
//   { role:'tool', toolCallId, name, result }   // result is JSON-able
//
// A provider.step({messages, tools}) returns:
//   { thought?:string, toolCalls?:[{id,name,args}], refused?:{reason} }
import { SOURCES, EVENT_TYPES, createEvent } from '../events.js';
import { ALL_TOOLS } from './tools.js';

export class AgentRunner {
  constructor({ agent, round = 1, bus, provider, session, onSubmit, shouldStop = () => false, system, task, maxSteps = 24, costTracker = null, model = null, maxWrongSubmissions = 3 }) {
    this.agent = agent;
    this.round = round;
    this.bus = bus;
    this.provider = provider;
    this.session = session;
    this.onSubmit = onSubmit;
    this.shouldStop = shouldStop;
    this.system = system;
    this.task = task;
    this.maxSteps = maxSteps;
    this.costTracker = costTracker;
    this.model = model ?? provider?.model ?? null;
    this.maxWrongSubmissions = maxWrongSubmissions;
  }

  async run() {
    const messages = [
      { role: 'system', text: this.system },
      { role: 'user', text: this.task },
    ];
    let wrongSubmissions = 0;

    for (let i = 0; i < this.maxSteps; i++) {
      if (this.shouldStop()) return { status: 'stopped', steps: i };

      let step;
      try {
        step = await this.provider.step({ messages, tools: ALL_TOOLS });
      } catch (e) {
        this._emit(EVENT_TYPES.REFUSED, { reason: `provider error: ${e.message}` });
        return { status: 'error', error: e.message };
      }

      // Charge this step's token usage against the shared race cost ceiling.
      // A step already paid for cannot be un-billed, so we check the cap after
      // recording and stop before spending anything more.
      if (this.costTracker && step.usage) {
        this.costTracker.add({ agent: this.agent, model: this.model, usage: step.usage });
        if (this.costTracker.exceeded()) return { status: 'cost', steps: i };
      }

      if (step.refused) {
        this._emit(EVENT_TYPES.REFUSED, { reason: step.refused.reason ?? 'refused' });
        return { status: 'refused' };
      }
      // Show the panel something every step. Many models (gpt-4o-mini,
      // gemini-flash) return a tool call with NO text, so fall back to a short
      // description of what the agent is doing.
      if (step.thought) this._emit(EVENT_TYPES.REASONING_TOKEN, { text: step.thought });
      else if (step.toolCalls?.length) this._emit(EVENT_TYPES.REASONING_TOKEN, { text: describeToolCalls(step.toolCalls) });

      messages.push({ role: 'assistant', text: step.thought, toolCalls: step.toolCalls ?? [] });

      if (!step.toolCalls || step.toolCalls.length === 0) {
        return { status: 'idle' }; // nothing to do; avoid spinning
      }

      for (const call of step.toolCalls) {
        if (this.shouldStop()) return { status: 'stopped', steps: i };

        if (call.name === 'submit') {
          const submission = call.args?.finding ?? call.args?.answer ?? '';
          this._emit(EVENT_TYPES.SUBMITTED, { finding: submission });
          const verdict = await this.onSubmit(submission);
          if (verdict.correct) {
            messages.push({ role: 'tool', toolCallId: call.id, name: 'submit', result: verdict });
            return { status: 'correct', won: !!verdict.won, submission };
          }
          // Wrong answer. Cap the attempts so a model can't spin on submit().
          wrongSubmissions++;
          const attemptsLeft = this.maxWrongSubmissions - wrongSubmissions;
          this._emit(EVENT_TYPES.REJECTED, { finding: submission, attemptsLeft });
          messages.push({ role: 'tool', toolCallId: call.id, name: 'submit', result: { ...verdict, attemptsLeft } });
          if (wrongSubmissions >= this.maxWrongSubmissions) {
            return { status: 'gave_up', submissions: wrongSubmissions };
          }
          continue; // let the model see the verdict (and attemptsLeft) and try again
        }

        let result;
        try {
          result = await this.session.runTool(call.name, call.args ?? {});
        } catch (e) {
          if (e.code === 'BUDGET') return { status: 'budget' };
          result = { error: e.message, code: e.code }; // let the model see and adapt
        }
        messages.push({ role: 'tool', toolCallId: call.id, name: call.name, result });
      }
    }
    return { status: 'exhausted' };
  }

  _emit(type, payload) {
    this.bus.publish(createEvent({
      round: this.round, source: SOURCES.AGENT, agent: this.agent, type, payload,
    }));
  }
}

/** A short human-readable line for a step whose model returned only tool calls,
 *  e.g. `list_dir /etc` or `grep "iotgoatuser"`. */
function describeToolCalls(calls) {
  return calls.map((c) => {
    const a = c.args ?? {};
    const detail = a.pattern != null ? `"${a.pattern}"` : (a.path ?? a.finding ?? '');
    return detail ? `${c.name} ${detail}` : c.name;
  }).join(', ');
}

export { ALL_TOOLS };
