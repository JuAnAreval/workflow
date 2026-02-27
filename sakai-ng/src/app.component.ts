import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { WorkflowGlobalFormModalComponent } from './app/layout/component/workflow-global-form-modal';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [RouterModule, WorkflowGlobalFormModalComponent],
    template: `<router-outlet></router-outlet>
    <app-workflow-global-form-modal></app-workflow-global-form-modal>`
})
export class AppComponent {}
