import {
  // common
  Injectable,
  ForbiddenException,
  HttpStatus,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectRepository } from './infrastructure/persistence/project.repository';
import { IPaginationOptions } from '../utils/types/pagination-options';
import { Project } from './domain/project';
import { ProjectWorkflowAutomationService } from './project-workflow-automation.service';
import { UserRepository } from '../users/infrastructure/persistence/user.repository';
import { RoleEnum } from '../roles/roles.enum';

@Injectable()
export class ProjectsService {
  constructor(
    // Dependencies here
    private readonly projectRepository: ProjectRepository,
    private readonly projectWorkflowAutomationService: ProjectWorkflowAutomationService,
    private readonly userRepository: UserRepository,
  ) {}

  async create(
    createProjectDto: CreateProjectDto,
    actorUserId?: number | string | null,
  ) {
    // Do not remove comment below.
    // <creating-property />
    if (actorUserId === null || actorUserId === undefined) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          user: 'notExists',
        },
      });
    }

    const ownerUser = await this.userRepository.findById(actorUserId);
    if (!ownerUser) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          user: 'notExists',
        },
      });
    }

    const createdProject = await this.projectRepository.create({
      // Do not remove comment below.
      // <creating-property-payload />
      user: ownerUser,

      description: createProjectDto.description,

      name: createProjectDto.name,
    });

    await this.projectWorkflowAutomationService.runProjectEvent(
      'created',
      createdProject,
      actorUserId,
    );

    return createdProject;
  }

  findAllWithPagination({
    paginationOptions,
    actorUserId,
    actorRoleId,
  }: {
    paginationOptions: IPaginationOptions;
    actorUserId?: number | string | null;
    actorRoleId?: number | string | null;
  }) {
    const isAdmin = this.isAdminRole(actorRoleId);

    const userIdFilter = isAdmin ? undefined : actorUserId;
    if (!isAdmin && (userIdFilter === null || userIdFilter === undefined)) {
      return Promise.resolve([]);
    }

    return this.projectRepository.findAllWithPagination({
      paginationOptions: {
        page: paginationOptions.page,
        limit: paginationOptions.limit,
      },
      userId: userIdFilter,
    });
  }

  async findById(
    id: Project['id'],
    actorUserId?: number | string | null,
    actorRoleId?: number | string | null,
  ) {
    const project = await this.projectRepository.findById(id);
    if (!project) {
      return null;
    }

    if (
      !this.isProjectOwnedByUser(project, actorUserId) &&
      !this.isAdminRole(actorRoleId)
    ) {
      return null;
    }

    return project;
  }

  findByIds(ids: Project['id'][]) {
    return this.projectRepository.findByIds(ids);
  }

  async update(
    id: Project['id'],

    updateProjectDto: UpdateProjectDto,
    actorUserId?: number | string | null,
    actorRoleId?: number | string | null,
  ) {
    // Do not remove comment below.
    // <updating-property />
    const existingProject = await this.projectRepository.findById(id);
    if (!existingProject) {
      return null;
    }

    const isOwner = this.isProjectOwnedByUser(existingProject, actorUserId);
    const isAdmin = this.isAdminRole(actorRoleId);
    if (!isOwner && !isAdmin) {
      return null;
    }

    let user: Project['user'] | undefined = undefined;
    if (updateProjectDto.user) {
      if (!isAdmin) {
        throw new ForbiddenException(
          'Solo un admin puede reasignar el dueno del proyecto.',
        );
      }

      const ownerUser = await this.userRepository.findById(updateProjectDto.user.id);
      if (!ownerUser) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            user: 'notExists',
          },
        });
      }
      user = ownerUser;
    }

    const updatedProject = await this.projectRepository.update(id, {
      // Do not remove comment below.
      // <updating-property-payload />
      user,
      description: updateProjectDto.description,

      name: updateProjectDto.name,
    });

    if (!updatedProject) {
      return null;
    }

    await this.projectWorkflowAutomationService.runProjectEvent(
      'updated',
      updatedProject,
      actorUserId,
    );

    return updatedProject;
  }

  async remove(
    id: Project['id'],
    actorUserId?: number | string | null,
    actorRoleId?: number | string | null,
  ) {
    const project = await this.projectRepository.findById(id);
    if (!project) {
      return;
    }

    if (
      !this.isProjectOwnedByUser(project, actorUserId) &&
      !this.isAdminRole(actorRoleId)
    ) {
      return;
    }

    await this.projectWorkflowAutomationService.runProjectEvent(
      'deleted',
      project,
      actorUserId,
    );

    return this.projectRepository.remove(id);
  }

  private isProjectOwnedByUser(
    project: Project,
    actorUserId?: number | string | null,
  ): boolean {
    if (actorUserId === null || actorUserId === undefined) {
      return false;
    }

    const ownerUserId = project.user?.id;
    if (ownerUserId === null || ownerUserId === undefined) {
      return false;
    }

    return String(ownerUserId) === String(actorUserId);
  }

  private isAdminRole(roleId?: number | string | null): boolean {
    if (roleId === null || roleId === undefined) {
      return false;
    }

    return Number(roleId) === RoleEnum.admin;
  }
}
