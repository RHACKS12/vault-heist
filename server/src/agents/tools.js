// The tools exposed to every agent. Four are read-only firmware tools backed by
// the Sandbox; `submit` is the win condition (name the vulnerability). Provider
// adapters translate these definitions into their own SDK's tool format.
//
// Schemas are JSON Schema (the shape Gemini, OpenAI/OpenAI, and Anthropic all
// accept for function/tool definitions).

export const TOOLS = Object.freeze({
  list_dir: {
    name: 'list_dir',
    description: 'List the entries of a directory in the firmware filesystem.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path within the firmware, e.g. "/etc".' },
      },
      required: ['path'],
    },
  },
  read_file: {
    name: 'read_file',
    description: 'Read a file. Byte-capped; binary files come back as a hex/ascii preview.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file.' },
        maxBytes: { type: 'integer', description: 'Max bytes to read (default 8192).' },
      },
      required: ['path'],
    },
  },
  grep: {
    name: 'grep',
    description: 'Recursively search file contents for a regular-expression pattern.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regular expression to search for.' },
        path: { type: 'string', description: 'Directory (or file) to search from. Default "/".' },
        ignoreCase: { type: 'boolean', description: 'Case-insensitive match.' },
      },
      required: ['pattern'],
    },
  },
  strings: {
    name: 'strings',
    description: 'Extract printable ASCII strings from a (usually binary) file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file.' },
        min: { type: 'integer', description: 'Minimum run length (default 4).' },
      },
      required: ['path'],
    },
  },
  submit: {
    name: 'submit',
    description:
      'Submit your final identification of the KNOWN vulnerability: the vulnerable ' +
      'file and function, or the exact hardcoded string/credential. Do not submit an exploit.',
    parameters: {
      type: 'object',
      properties: {
        finding: {
          type: 'string',
          description: 'The specific finding, e.g. "/etc/shadow hardcoded credentials for iotgoatuser".',
        },
      },
      required: ['finding'],
    },
  },
});

/** The four sandbox tools (no `submit`). */
export const SANDBOX_TOOLS = Object.freeze([TOOLS.list_dir, TOOLS.read_file, TOOLS.grep, TOOLS.strings]);

/** All five tools handed to an agent. */
export const ALL_TOOLS = Object.freeze([...SANDBOX_TOOLS, TOOLS.submit]);
