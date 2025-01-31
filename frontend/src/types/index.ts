export interface FileInfo {
  file_id: string;
  filename: string;
  path: string;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface Message {
  text: string;
  isUser: boolean;
  tokenUsage?: TokenUsage;
  images?: string[];
  files?: FileInfo[];
  runSteps?: RunStep[];
  isFunctionCall?: boolean;
  isDxaResponse?: boolean;
}

export interface RunStepToolCall {
  type: string;
  code_interpreter?: {
    input: string;
    outputs: Array<{
      type: string;
      logs?: string;
      image?: {
        file_id: string;
      };
    }>;
  };
}

export interface RunStep {
  type: string;
  step_details: {
    tool_calls?: RunStepToolCall[];
  };
}

export type ImageDetailLevel = 'low' | 'high' | 'auto';

export interface DxaResponse {
  status: string;
  answer: DxaAnswer;
}

export interface DxaAnswer {
  response: DxaAnswerResponse;
  success: boolean;
  task_id: string;
}

export interface DxaAnswerResponse {
  main_task: string;
  ooda_task_id: string;
  substasks: DxaTask[];
  task_result: DxaTaskResult;
}

export interface DxaTask {
  status: string;
  task: string;
  task_id: string;
  task_result: DxaTaskResult;
}

export interface DxaTaskResult {
  citations: DxaTaskCitation[];
  content: string;
}

export interface DxaTaskCitation {
  file_path: string;
  image_src: string; // 現状nullが返却されている、おそらくstring
  page_index: number;
  source: string;
  type: string;
}
