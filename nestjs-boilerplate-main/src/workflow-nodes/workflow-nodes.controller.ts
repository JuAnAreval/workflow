import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { WorkflowNodesService } from './workflow-nodes.service';
import { CreateWorkflowNodeDto } from './dto/create-workflow-node.dto';
import { UpdateWorkflowNodeDto } from './dto/update-workflow-node.dto';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { WorkflowNode } from './domain/workflow-node';
import { AuthGuard } from '@nestjs/passport';
import {
  InfinityPaginationResponse,
  InfinityPaginationResponseDto,
} from '../utils/dto/infinity-pagination-response.dto';
import { infinityPagination } from '../utils/infinity-pagination';
import { FindAllWorkflowNodesDto } from './dto/find-all-workflow-nodes.dto';

@ApiTags('Workflownodes')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'workflow-nodes',
  version: '1',
})
export class WorkflowNodesController {
  constructor(private readonly workflowNodesService: WorkflowNodesService) {}

  @Post()
  @ApiCreatedResponse({
    type: WorkflowNode,
  })
  create(@Body() createWorkflowNodeDto: CreateWorkflowNodeDto) {
    return this.workflowNodesService.create(createWorkflowNodeDto);
  }

  @Get()
  @ApiOkResponse({
    type: InfinityPaginationResponse(WorkflowNode),
  })
  async findAll(
    @Query() query: FindAllWorkflowNodesDto,
  ): Promise<InfinityPaginationResponseDto<WorkflowNode>> {
    const page = query?.page ?? 1;
    let limit = query?.limit ?? 10;
    if (limit > 50) {
      limit = 50;
    }

    return infinityPagination(
      await this.workflowNodesService.findAllWithPagination({
        paginationOptions: {
          page,
          limit,
        },
      }),
      { page, limit },
    );
  }

  @Get(':id')
  @ApiParam({
    name: 'id',
    type: String,
    required: true,
  })
  @ApiOkResponse({
    type: WorkflowNode,
  })
  findById(@Param('id') id: string) {
    return this.workflowNodesService.findById(id);
  }

  @Patch(':id')
  @ApiParam({
    name: 'id',
    type: String,
    required: true,
  })
  @ApiOkResponse({
    type: WorkflowNode,
  })
  update(
    @Param('id') id: string,
    @Body() updateWorkflowNodeDto: UpdateWorkflowNodeDto,
  ) {
    return this.workflowNodesService.update(id, updateWorkflowNodeDto);
  }

  @Delete(':id')
  @ApiParam({
    name: 'id',
    type: String,
    required: true,
  })
  remove(@Param('id') id: string) {
    return this.workflowNodesService.remove(id);
  }
}
