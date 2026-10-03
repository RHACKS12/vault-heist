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
  constructor({ agent, round = 1, bus, provider, session, onSubmit, shouldStop = () => false, system, task, maxSteps = 24 }) {
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
  }

  async run() {
    const messages = [
      { role: 'system', text: this.system },
      { role: 'user', text: this.task },
    ];

    for (let i = 0; i < this.maxSteps; i++) {
      if (this.shouldStop()) return { status: 'stopped', steps: i };

      let step;
      try {
        step = await this.provider.step({ messages, tools: ALL_TOOLS });
      } catch (e) {
        this._emit(EVENT_TYPES.REFUSED, { reason: `provider error: ${e.message}` });
        return { status: 'error', error: e.message };
      }

      if (step.refused) {
        this._emit(EVENT_TYPES.REFUSED, { reason: step.refused.reason ?? 'refused' });
        return { status: 'refused' };
      }
      if (step.thought) this._emit(EVENT_TYPES.REASONING_TOKEN, { text: step.thought });

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
          messages.push({ role: 'tool', toolCallId: call.id, name: 'submit', result: verdict });
          if (verdict.correct) return { status: 'correct', won: !!verdict.won, submission };
          continue; // wrong answer: the model sees the verdict and keeps looking
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

export { ALL_TOOLS };
