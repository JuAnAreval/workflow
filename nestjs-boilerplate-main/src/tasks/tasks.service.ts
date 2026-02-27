import { ProjectsService } from '../projects/projects.service';
import { Project } from '../projects/domain/project';

import {
  // common
  Injectable,
  HttpStatus,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskRepository } from './infrastructure/persistence/task.repository';
import { IPaginationOptions } from '../utils/types/pagination-options';
import { Task } from './domain/task';
import { ProjectWorkflowAutomationService } from '../projects/project-workflow-automation.service';

@Injectable()
export class TasksService {
  constructor(
    private readonly projectService: ProjectsService,
    private readonly projectWorkflowAutomationService: ProjectWorkflowAutomationService,

    // Dependencies here
    private readonly taskRepository: TaskRepository,
  ) {}

  async create(
    createTaskDto: CreateTaskDto,
    actorUserId?: number | string | null,
  ) {
    // Do not remove comment below.
    // <creating-property />

    const projectObject = await this.projectService.findById(
      createTaskDto.project.id,
      actorUserId,
    );
    if (!projectObject) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          project: 'notExists',
        },
      });
    }
    const project = projectObject;

    const createdTask = await this.taskRepository.create({
      // Do not remove comment below.
      // <creating-property-payload />
      estado: createTaskDto.estado,

      description: createTaskDto.description,

      project,

      name: createTaskDto.name,
    });

    await this.projectWorkflowAutomationService.runTaskEvent(
      'created',
      createdTask,
      actorUserId,
    );

    return createdTask;
  }

  findAllWithPagination({
    paginationOptions,
  }: {
    paginationOptions: IPaginationOptions;
  }) {
    return this.taskRepository.findAllWithPagination({
      paginationOptions: {
        page: paginationOptions.page,
        limit: paginationOptions.limit,
      },
    });
  }

  findById(id: Task['id']) {
    return this.taskRepository.findById(id);
  }

  findByIds(ids: Task['id'][]) {
    return this.taskRepository.findByIds(ids);
  }

  async update(
    id: Task['id'],

    updateTaskDto: UpdateTaskDto,
    actorUserId?: number | string | null,
  ) {
    // Do not remove comment below.
    // <updating-property />

    let project: Project | undefined = undefined;

    if (updateTaskDto.project) {
      const projectObject = await this.projectService.findById(
        updateTaskDto.project.id,
        actorUserId,
      );
      if (!projectObject) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            project: 'notExists',
          },
        });
      }
      project = projectObject;
    }

    const updatedTask = await this.taskRepository.update(id, {
      // Do not remove comment below.
      // <updating-property-payload />
      estado: updateTaskDto.estado,

      description: updateTaskDto.description,

      project,

      name: updateTaskDto.name,
    });

    if (!updatedTask) {
      return null;
    }

    await this.projectWorkflowAutomationService.runTaskEvent(
      'updated',
      updatedTask,
      actorUserId,
    );

    return updatedTask;
  }

  async remove(id: Task['id'], actorUserId?: number | string | null) {
    const task = await this.taskRepository.findById(id);
    if (task) {
      await this.projectWorkflowAutomationService.runTaskEvent(
        'deleted',
        task,
        actorUserId,
      );
    }

    return this.taskRepository.remove(id);
  }
}
