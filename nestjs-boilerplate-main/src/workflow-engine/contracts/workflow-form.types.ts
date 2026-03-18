export type WorkflowFormFieldType =
  | 'text'
  | 'number'
  | 'email'
  | 'password'
  | 'textarea'
  | 'select'
  | 'instruction';

export type WorkflowFormFieldOption = {
  value: string;
  label: string;
};

export type WorkflowFormFieldDefinition = {
  key: string;
  name: string;
  label: string;
  type: WorkflowFormFieldType;
  required: boolean;
  placeholder: string | null;
  helpText: string | null;
  defaultValue: string | null;
  options: WorkflowFormFieldOption[];
};
