import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';

export type WorkflowExecutionFormField = {
  name: string;
  value: string;
};

@Component({
  selector: 'app-workflow-execution-form-modal',
  standalone: true,
  imports: [CommonModule, DialogModule, ButtonModule],
  templateUrl: './workflow-execution-form-modal.html',
  styleUrl: './workflow-execution-form-modal.scss',
})
export class WorkflowExecutionFormModalComponent {
  @Input() visible = false;
  @Input() title = 'Formulario';
  @Input() fields: WorkflowExecutionFormField[] = [];
  @Input() statusMessage = '';
  @Input() isSubmitting = false;

  @Output() closeRequest = new EventEmitter<void>();
  @Output() submitRequest = new EventEmitter<void>();
  @Output() fieldValueChange = new EventEmitter<{ index: number; value: string }>();

  onHide(): void {
    if (this.isSubmitting) {
      return;
    }

    this.closeRequest.emit();
  }

  onFieldInput(index: number, event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.fieldValueChange.emit({
      index,
      value: target?.value ?? '',
    });
  }

  requestClose(): void {
    if (this.isSubmitting) {
      return;
    }
    this.closeRequest.emit();
  }

  requestSubmit(): void {
    if (this.isSubmitting) {
      return;
    }
    this.submitRequest.emit();
  }
}
