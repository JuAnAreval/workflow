import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CompleteWorkflowAssignmentDto } from './dto/complete-workflow-assignment.dto';
import { QueryAdminWorkflowAssignmentsDto } from './dto/query-admin-workflow-assignments.dto';
import { QueryMyWorkflowAssignmentsDto } from './dto/query-my-workflow-assignments.dto';
import { ReviewWorkflowAssignmentDto } from './dto/review-workflow-assignment.dto';
import { Roles } from '../roles/roles.decorator';
import { RoleEnum } from '../roles/roles.enum';
import { RolesGuard } from '../roles/roles.guard';
import { WorkflowAssignmentsService } from './workflow-assignments.service';

@ApiTags('WorkflowAssignments')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'workflow-assignments',
  version: '1',
})
export class WorkflowAssignmentsController {
  constructor(
    private readonly workflowAssignmentsService: WorkflowAssignmentsService,
  ) {}

  @Get('me')
  @ApiOkResponse({
    description: 'Pendientes workflow del usuario autenticado',
  })
  findMy(
    @Request() request,
    @Query() query: QueryMyWorkflowAssignmentsDto,
  ) {
    return this.workflowAssignmentsService.findMine(request.user?.id, query);
  }

  @Get('admin')
  @Roles(RoleEnum.admin)
  @UseGuards(RolesGuard)
  @ApiOkResponse({
    description: 'Pendientes workflow para revision de administradores',
  })
  findForAdmin(@Query() query: QueryAdminWorkflowAssignmentsDto) {
    return this.workflowAssignmentsService.findForAdmin(query);
  }

  @Get('me/pending-count')
  @ApiOkResponse({
    description: 'Cantidad de pendientes workflow sin completar',
  })
  async countMyPending(@Request() request) {
    const count = await this.workflowAssignmentsService.countMyPending(
      request.user?.id,
    );
    return { count };
  }

  @Get('assignable-users')
  @ApiOkResponse({
    description: 'Usuarios disponibles para asignar en nodos de workflow',
  })
  listAssignableUsers(@Query('limit') limitRaw?: string) {
    const limit = Number(limitRaw);
    return this.workflowAssignmentsService.listAssignableUsers(
      Number.isFinite(limit) ? limit : 50,
    );
  }

  @Post(':id/submit')
  @ApiParam({
    name: 'id',
    type: String,
    required: true,
  })
  @ApiCreatedResponse({
    description: 'Envia el pendiente a revision de admin',
  })
  submit(
    @Request() request,
    @Param('id') id: string,
    @Body() payload: CompleteWorkflowAssignmentDto,
  ) {
    return this.workflowAssignmentsService.submitByAssignedUser(
      id,
      request.user?.id,
      payload,
    );
  }

  @Post(':id/review')
  @Roles(RoleEnum.admin)
  @UseGuards(RolesGuard)
  @ApiParam({
    name: 'id',
    type: String,
    required: true,
  })
  @ApiCreatedResponse({
    description: 'Aprueba o rechaza un pendiente enviado',
  })
  review(
    @Request() request,
    @Param('id') id: string,
    @Body() payload: ReviewWorkflowAssignmentDto,
  ) {
    return this.workflowAssignmentsService.reviewByAdmin(
      id,
      request.user?.id,
      payload,
    );
  }

  @Post(':id/complete')
  @ApiParam({
    name: 'id',
    type: String,
    required: true,
  })
  @ApiCreatedResponse({
    description: 'Alias legado de submit',
  })
  complete(
    @Request() request,
    @Param('id') id: string,
    @Body() payload: CompleteWorkflowAssignmentDto,
  ) {
    return this.workflowAssignmentsService.completeByAssignedUser(
      id,
      request.user?.id,
      payload,
    );
  }
}
