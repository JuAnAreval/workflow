import { Module } from '@nestjs/common';
import { TaskRepository } from '../task.repository';
import { TaskRelationalRepository } from './repositories/task.repository';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskEntity } from './entities/task.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TaskEntity])],
  providers: [
    {
      provide: TaskRepository,
      useClass: TaskRelationalRepository,
    },
  ],
  exports: [TaskRepository],
})
export class RelationalTaskPersistenceModule {}
