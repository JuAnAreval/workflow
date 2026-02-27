import { ProjectsModule } from '../projects/projects.module';
import {
  // do not remove this comment
  Module,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { RelationalTaskPersistenceModule } from './infrastructure/persistence/relational/relational-persistence.module';

@Module({
  imports: [
    ProjectsModule,

    // do not remove this comment
    RelationalTaskPersistenceModule,
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService, RelationalTaskPersistenceModule],
})
export class TasksModule {}
