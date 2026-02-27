import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { TaskService } from '@/app/core/services/task/task.service';
import { ConfirmationService } from 'primeng/api';
import { ConfirmDialog } from "primeng/confirmdialog";

@Component({
    selector: 'app-task',
    imports: [CommonModule, FormsModule, CardModule, ButtonModule, InputTextModule, TextareaModule, ConfirmDialog],
    templateUrl: './task.html',
    styleUrl: './task.scss',
    providers: [ConfirmationService]

})
export class Task implements OnInit {
    taskService = inject(TaskService);
    route = inject(ActivatedRoute);
    cdr = inject(ChangeDetectorRef);
    confirmationService = inject(ConfirmationService);

    tasks: any[] = [];
    projectId: string = '';
    newTask = { name: '', description: '', estado: '' };
    editingTask: any = null;
    statusOptions = [
        { label: 'Pendiente', value: 'pendiente' },
        { label: 'En Progreso', value: 'en progreso' },
        { label: 'Completada', value: 'completada' }
    ];

    ngOnInit() {
        this.route.queryParams.subscribe(params => {
            this.projectId = params['projectId'];
            if (this.projectId) {
                this.loadTasks();
            } else {
                this.tasks = [];
                this.cdr.detectChanges();
            }
        });
    }

    loadTasks(): void {
        this.taskService.Get(this.projectId).subscribe({
            next: (res: any) => {
                const allTasks = res.data ?? res;
                this.tasks = allTasks.filter((task: any) => task.project?.id === this.projectId);
                this.cdr.detectChanges();
            },
            error: (err) => console.error(err)
        });
    }

    createTask(form: any) {
        if (!this.newTask.name || !this.newTask.estado) return;

        const taskData = {
            name: this.newTask.name,
            description: this.newTask.description,
            estado: this.newTask.estado,
            project: {
                id: this.projectId
            }
        };

        this.taskService.Post(taskData).subscribe({
            next: () => {
                this.newTask.name = '';
                this.newTask.description = '';
                this.newTask.estado = '';
                form.resetForm();
                this.loadTasks();
                this.cdr.detectChanges();
            },
            error: (err) => console.error(err)
        });
    }

    editTask(task: any) {
        this.editingTask = { ...task };
    }

    saveEdit() {
        if (!this.editingTask.name || !this.editingTask.estado) return;

        this.taskService.patch(this.editingTask.id, this.editingTask).subscribe({
            next: () => {
                this.editingTask = null;
                this.loadTasks();
                this.cdr.detectChanges();
            },
            error: (err: any) => console.error(err)
        });
    }

    cancelEdit() {
        this.editingTask = null;
    }

    deleteTask(task: any) {

        this.confirmationService.confirm({
            message: `¿Estás seguro de que quieres eliminar la tarea "${task.name}"?`,
            header: 'Confirmar Eliminación',
            icon: 'pi pi-exclamation-triangle',
            accept: () => {
                this.taskService.Delete(task.id).subscribe({
                    next: () => {
                        this.loadTasks();
                        this.cdr.detectChanges();
                    },
                    error: (err) => console.error(err)
                });
            }
        });
    }



    isEditing(task: any): boolean {
        return this.editingTask && this.editingTask.id === task.id;
    }
}
