import { Routes } from '@angular/router';
import { Documentation } from './documentation/documentation';
import { Crud } from './crud/crud';
import { Empty } from './empty/empty';
import { Project } from './project/project';
import { Task } from './task/task';
import { WorkflowEditorPage } from './workflow/editor/workflow-editor.page';
import { WorkflowList } from './workflow/list/workflow-list.page';
import { WorkflowInbox } from './workflow/inbox/workflow-inbox.page';
import { roleGuard } from '../guards/role.guard';

export default [
    { path: 'documentation', component: Documentation },
    { path: 'crud', component: Crud },
    { path: 'empty', component: Empty },
    { path: 'projects', component: Project },
    { path: 'tasks', component: Task },
    { path: 'workflow', redirectTo: 'workflow/list', pathMatch: 'full' },
    {
        path: 'workflow/list',
        component: WorkflowList,
        canActivate: [roleGuard],
        data: { roles: ['Admin', 'User'] }
    },
    {
        path: 'workflow/editor/:id',
        component: WorkflowEditorPage,
        canActivate: [roleGuard],
        data: { roles: ['Admin', 'User'] }
    },
    {
        path: 'workflow/inbox',
        component: WorkflowInbox,
        canActivate: [roleGuard],
        data: { roles: ['Admin', 'User'] }
    },
    { path: '**', redirectTo: '/notfound' }
] as Routes;
