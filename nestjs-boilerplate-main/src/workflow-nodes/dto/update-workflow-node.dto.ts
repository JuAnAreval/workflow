// Don't forget to use the class-validator decorators in the DTO properties.
// import { Allow } from 'class-validator';

import { PartialType } from '@nestjs/swagger';
import { CreateWorkflowNodeDto } from './create-workflow-node.dto';

export class UpdateWorkflowNodeDto extends PartialType(CreateWorkflowNodeDto) {}
