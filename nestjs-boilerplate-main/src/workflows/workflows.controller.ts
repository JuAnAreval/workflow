import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Request,
  UseGuards,
  Query,
} from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Workflow } from './domain/workflow';
import { AuthGuard } from '@nestjs/passport';
import {
  InfinityPaginationResponse,
  InfinityPaginationResponseDto,
} from '../utils/dto/infinity-pagination-response.dto';
import { infinityPagination } from '../utils/infinity-pagination';
import { FindAllWorkflowsDto } from './dto/find-all-workflows.dto';
import { TestHttpRequestDto } from './dto/test-http-request.dto';
import { CompleteWorkflowFormAssignmentDto } from './dto/complete-workflow-form-assignment.dto';

@ApiTags('Workflows')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'workflows',
  version: '1',
})
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Post()
  @ApiCreatedResponse({
    type: Workflow,
  })
  create(@Body() createWorkflowDto: CreateWorkflowDto) {
    return this.workflowsService.create(createWorkflowDto);
  }

  @Get()
  @ApiOkResponse({
    type: InfinityPaginationResponse(Workflow),
  })
  async findAll(
    @Query() query: FindAllWorkflowsDto,
  ): Promise<InfinityPaginationResponseDto<Workflow>> {
    const page = query?.page ?? 1;
    let limit = query?.limit ?? 10;
    if (limit > 50) {
      limit = 50;
    }

    return infinityPagination(
      await this.workflowsService.findAllWithPagination({
        paginationOptions: {
          page,
          limit,
        },
      }),
      { page, limit },
    );
  }

  @Get(':id/saved-jsons')
  @ApiParam({
    name: 'id',
    type: String,
    required: true,
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        workflowId: { type: 'string' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              workflowId: { type: 'string' },
              workflowNodeId: { type: 'string', nullable: true },
              sourceType: {
                type: 'string',
                enum: [
                  'form_json',
                  'http_json',
                  'javascript_json',
                  'webhook_json',
                ],
              },
              sourceNodeType: { type: 'string', nullable: true },
              nodeLabel: { type: 'string', nullable: true },
              payload: {
                type: 'object',
                nullable: true,
                additionalProperties: true,
              },
              payloadRaw: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  })
  listSavedJsons(
    @Request() request,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.workflowsService.listSavedJsons(
      id,
      request.user?.id,
      request.user?.role?.id,
      limit,
    );
  }

  @Get(':id')
  @ApiParam({
    name: 'id',
    type: String,
    required: true,
  })
  @ApiOkResponse({
    type: Workflow,
  })
  findById(@Param('id') id: string) {
    return this.workflowsService.findById(id);
  }

  @Patch(':id')
  @ApiParam({
    name: 'id',
    type: String,
    required: true,
  })
  @ApiOkResponse({
    type: Workflow,
  })
  update(
    @Param('id') id: string,
    @Body() updateWorkflowDto: UpdateWorkflowDto,
  ) {
    return this.workflowsService.update(id, updateWorkflowDto);
  }

  @Delete(':id')
  @ApiParam({
    name: 'id',
    type: String,
    required: true,
  })
  remove(@Param('id') id: string) {
    return this.workflowsService.remove(id);
  }

  @Post('test-http-request')
  @ApiBody({
    type: TestHttpRequestDto,
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        method: { type: 'string', example: 'POST' },
        url: { type: 'string', example: 'https://api.example.com/webhook' },
        status: { type: 'number', nullable: true, example: 200 },
        statusText: { type: 'string', nullable: true, example: 'OK' },
        durationMs: { type: 'number', example: 173 },
        responsePreview: {
          type: 'string',
          example: '{"ok":true}',
        },
        errorType: {
          type: 'string',
          nullable: true,
          enum: ['http_error', 'timeout', 'network_error', 'unknown_error'],
        },
        errorMessage: { type: 'string', nullable: true },
      },
    },
  })
  testHttpRequest(@Body() testHttpRequestDto: TestHttpRequestDto) {
    return this.workflowsService.testHttpRequest(testHttpRequestDto);
  }

  @Post(':id/execute-manual')
  @ApiParam({
    name: 'id',
    type: String,
    required: true,
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        executed: { type: 'boolean', example: true },
        workflowId: { type: 'string' },
        paused: { type: 'boolean', example: false },
        pausedFormAssignmentsCount: { type: 'number', example: 0 },
        currentUserFormAssignment: {
          nullable: true,
          type: 'object',
          properties: {
            id: { type: 'string' },
            assignedToUserId: { type: 'number' },
            sourceNodeId: { type: 'string', nullable: true },
            sourceWorkflowId: { type: 'string', nullable: true },
            nodeLabel: { type: 'string', nullable: true },
            fields: { type: 'array', items: { type: 'string' } },
            data: {
              type: 'object',
              additionalProperties: true,
            },
          },
        },
      },
    },
  })
  executeManual(@Request() request, @Param('id') id: string) {
    return this.workflowsService.executeManual(
      id,
      request.user?.id,
      request.user?.role?.id,
    );
  }

  @Post('form-assignments/:id/complete')
  @ApiParam({
    name: 'id',
    type: String,
    required: true,
  })
  @ApiBody({
    type: CompleteWorkflowFormAssignmentDto,
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        completed: { type: 'boolean', example: true },
        assignment: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            assignedToUserId: { type: 'number' },
            sourceNodeId: { type: 'string', nullable: true },
            sourceWorkflowId: { type: 'string', nullable: true },
            nodeLabel: { type: 'string', nullable: true },
            fields: { type: 'array', items: { type: 'string' } },
            data: {
              type: 'object',
              additionalProperties: true,
            },
          },
        },
        paused: { type: 'boolean', example: false },
        pausedFormAssignmentsCount: { type: 'number', example: 0 },
        currentUserFormAssignment: {
          nullable: true,
          type: 'object',
          properties: {
            id: { type: 'string' },
            assignedToUserId: { type: 'number' },
            sourceNodeId: { type: 'string', nullable: true },
            sourceWorkflowId: { type: 'string', nullable: true },
            nodeLabel: { type: 'string', nullable: true },
            fields: { type: 'array', items: { type: 'string' } },
            data: {
              type: 'object',
              additionalProperties: true,
            },
          },
        },
      },
    },
  })
  completeFormAssignment(
    @Request() request,
    @Param('id') id: string,
    @Body() payload: CompleteWorkflowFormAssignmentDto,
  ) {
    return this.workflowsService.completeFormAssignment(
      id,
      payload,
      request.user?.id,
    );
  }
}
