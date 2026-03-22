export interface ToolInfo {
  command: string;
  name: string;
  description: string;
  install: { darwin: string; linux: string };
}

const tools: ToolInfo[] = [
  {
    command: 'gh',
    name: 'GitHub CLI',
    description: 'efficient GitHub access instead of web fetching',
    install: { darwin: 'brew install gh', linux: 'sudo apt install gh' },
  },
  {
    command: 'jq',
    name: 'jq',
    description: 'efficient JSON processing',
    install: { darwin: 'brew install jq', linux: 'sudo apt install jq' },
  },
];

const toolMap = new Map(tools.map(t => [t.command, t]));

export function findTool(command: string): ToolInfo | undefined {
  return toolMap.get(command);
}
