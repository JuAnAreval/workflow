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
import { WorkflowEdgesService } from './workflow-edges.service';
import { CreateWorkflowEdgeDto } from './dto/create-workflow-edge.dto';
import { UpdateWorkflowEdgeDto } from './dto/update-workflow-edge.dto';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { WorkflowEdge } from './domain/workflow-edge';
import { AuthGuard } from '@nestjs/passport';
import {
  InfinityPaginationResponse,
  InfinityPaginationResponseDto,
} from '../utils/dto/infinity-pagination-response.dto';
import { infinityPagination } from '../utils/infinity-pagination';
import { FindAllWorkflowEdgesDto } from './dto/find-all-workflow-edges.dto';

@ApiTags('Workflowedges')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'workflow-edges',
  version: '1',
})
export class WorkflowEdgesController {
  constructor(private readonly workflowEdgesService: WorkflowEdgesService) {}

  @Post()
  @ApiCreatedResponse({
    type: WorkflowEdge,
  })
  create(@Body() createWorkflowEdgeDto: CreateWorkflowEdgeDto) {
    return this.workflowEdgesService.create(createWorkflowEdgeDto);
  }

  @Get()
  @ApiOkResponse({
    type: InfinityPaginationResponse(WorkflowEdge),
  })
  async findAll(
    @Query() query: FindAllWorkflowEdgesDto,
  ): Promise<InfinityPaginationResponseDto<WorkflowEdge>> {
    const page = query?.page ?? 1;
    let limit = query?.limit ?? 10;
    if (limit > 50) {
      limit = 50;
    }

    return infinityPagination(
      await this.workflowEdgesService.findAllWithPagination({
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
    type: WorkflowEdge,
  })
  findById(@Param('id') id: string) {
    return this.workflowEdgesService.findById(id);
  }

  @Patch(':id')
  @ApiParam({
    name: 'id',
    type: String,
    required: true,
  })
  @ApiOkResponse({
    type: WorkflowEdge,
  })
  update(
    @Param('id') id: string,
    @Body() updateWorkflowEdgeDto: UpdateWorkflowEdgeDto,
  ) {
    return this.workflowEdgesService.update(id, updateWorkflowEdgeDto);
  }

  @Delete(':id')
  @ApiParam({
    name: 'id',
    type: String,
    required: true,
  })
  remove(@Param('id') id: string) {
    return this.workflowEdgesService.remove(id);
  }
}
