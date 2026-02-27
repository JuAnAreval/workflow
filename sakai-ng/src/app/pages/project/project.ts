import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { ProjectService } from '@/app/core/services/project/project.service';
import { UserService } from '@/app/core/services/user/user.service';
import { AuthService } from '@/app/core/services/auth/auth.service';

type ProjectOwnerModel = {
  id: number | string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

type ProjectModel = {
  id: string;
  name: string;
  description?: string | null;
  user?: ProjectOwnerModel | null;
};

type UserModel = {
  id: number | string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

type OwnerOption = {
  id: number | string;
  label: string;
};

type PaginatedResponse<T> = {
  data?: T[];
  hasNextPage?: boolean;
};

type EditingProjectModel = {
  id: string;
  name: string;
  description: string;
  ownerId: number | string | null;
};

@Component({
  selector: 'app-project',
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    ConfirmDialogModule,
  ],
  templateUrl: './project.html',
  styleUrl: './project.scss',
  providers: [ConfirmationService],
})
export class Project implements OnInit {
  projectService = inject(ProjectService);
  userService = inject(UserService);
  authService = inject(AuthService);
  confirmationService = inject(ConfirmationService);
  cdr = inject(ChangeDetectorRef);
  router = inject(Router);

  projects: ProjectModel[] = [];
  newProject = { name: '', description: '' };
  editingProject: EditingProjectModel | null = null;
  ownerOptions: OwnerOption[] = [];
  ownerLoadError = '';
  isAdmin = false;
  currentPage = 1;
  hasNextPage = false;
  loading = false;
  isDeletingAllProjects = false;

  ngOnInit(): void {
    this.isAdmin = this.hasAdminRole();
    this.loadProjects();
    if (this.isAdmin) {
      void this.loadOwnerOptions();
    }
  }

  loadProjects(page: number = 1, append: boolean = false): void {
    if (!append) {
      this.loading = true;
    }

    this.projectService.Get(page).subscribe({
      next: (res: PaginatedResponse<ProjectModel> | ProjectModel[]) => {
        const data = (res as PaginatedResponse<ProjectModel>)?.data ?? res;
        const projects = Array.isArray(data) ? data : ([] as ProjectModel[]);
        if (append) {
          this.projects = [...this.projects, ...projects];
        } else {
          this.projects = projects;
        }
        this.hasNextPage = (res as PaginatedResponse<ProjectModel>)?.hasNextPage ?? false;
        this.currentPage = page;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        if (!append) {
          this.projects = [];
        }
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  createProject(form: { resetForm: () => void }): void {
    if (!this.newProject.name.trim()) {
      return;
    }

    this.projectService.Post(this.newProject).subscribe({
      next: () => {
        this.newProject.name = '';
        this.newProject.description = '';
        form.resetForm();
        this.loadProjects();
      },
      error: (err) => console.error(err),
    });
  }

  editProject(project: ProjectModel): void {
    this.editingProject = {
      id: project.id,
      name: project.name,
      description: project.description ?? '',
      ownerId: project.user?.id ?? null,
    };
  }

  saveEdit(): void {
    if (!this.editingProject) {
      return;
    }

    const nextName = this.editingProject.name.trim();
    if (!nextName) {
      return;
    }

    const payload: {
      name: string;
      description?: string | null;
      user?: { id: number | string };
    } = {
      name: nextName,
      description: this.editingProject.description?.trim() ?? '',
    };

    if (
      this.isAdmin &&
      this.editingProject.ownerId !== null &&
      this.editingProject.ownerId !== undefined
    ) {
      payload.user = { id: this.editingProject.ownerId };
    }

    this.projectService.Patch(this.editingProject.id, payload).subscribe({
      next: () => {
        this.editingProject = null;
        this.loadProjects();
      },
      error: (err) => console.error(err),
    });
  }

  cancelEdit(): void {
    this.editingProject = null;
  }

  deleteProject(project: ProjectModel): void {
    this.confirmationService.confirm({
      message: `Estas seguro de que quieres eliminar el proyecto "${project.name}"?`,
      header: 'Confirmar eliminacion',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.projectService.Delete(project.id).subscribe({
          next: () => {
            this.loadProjects();
          },
          error: (err) => console.error(err),
        });
      },
    });
  }

  deleteAllProjects(): void {
    this.confirmationService.confirm({
      message:
        'Estas seguro de que quieres eliminar todos los proyectos? Esta accion no se puede deshacer.',
      header: 'Confirmar eliminacion masiva',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar todos',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        void this.deleteAllProjectsConfirmed();
      },
    });
  }

  nextPage(): void {
    if (this.hasNextPage && !this.loading) {
      this.loadProjects(this.currentPage + 1, false);
    }
  }

  prevPage(): void {
    if (this.currentPage > 1 && !this.loading) {
      this.loadProjects(this.currentPage - 1, false);
    }
  }

  navigateToTasks(project: ProjectModel): void {
    this.router.navigate(['/pages/tasks'], { queryParams: { projectId: project.id } });
  }

  getProjectOwnerLabel(project: ProjectModel): string {
    const owner = project.user;
    if (!owner) {
      return '-';
    }

    const fullName = `${owner.firstName ?? ''} ${owner.lastName ?? ''}`.trim();
    if (fullName) {
      return fullName;
    }
    if (owner.email?.trim()) {
      return owner.email.trim();
    }
    return `#${owner.id}`;
  }

  private hasAdminRole(): boolean {
    const role = this.authService.getUserRole();
    return role?.trim().toLowerCase() === 'admin';
  }

  private async loadOwnerOptions(): Promise<void> {
    try {
      let page = 1;
      const allUsers: UserModel[] = [];

      while (page <= 20) {
        const response = (await firstValueFrom(
          this.userService.Get(page, 50),
        )) as PaginatedResponse<UserModel>;
        const pageUsers = Array.isArray(response?.data) ? response.data : [];
        allUsers.push(...pageUsers);

        if (!response?.hasNextPage) {
          break;
        }
        page += 1;
      }

      this.ownerOptions = allUsers
        .map((user) => ({
          id: user.id,
          label: this.getOwnerOptionLabel(user),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
      this.ownerLoadError = '';
      this.cdr.detectChanges();
    } catch {
      this.ownerOptions = [];
      this.ownerLoadError = 'No se pudo cargar la lista de usuarios.';
      this.cdr.detectChanges();
    }
  }

  private getOwnerOptionLabel(user: UserModel): string {
    const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
    if (fullName) {
      return `${fullName} (#${user.id})`;
    }
    if (user.email?.trim()) {
      return `${user.email.trim()} (#${user.id})`;
    }
    return `Usuario #${user.id}`;
  }

  private async deleteAllProjectsConfirmed(): Promise<void> {
    if (this.isDeletingAllProjects) {
      return;
    }

    this.isDeletingAllProjects = true;
    this.loading = true;
    this.cdr.detectChanges();

    try {
      const projectIds = await this.fetchAllProjectIds();
      if (!projectIds.length) {
        this.loadProjects();
        return;
      }

      const chunkSize = 10;
      for (let index = 0; index < projectIds.length; index += chunkSize) {
        const chunk = projectIds.slice(index, index + chunkSize);
        await Promise.allSettled(
          chunk.map((projectId) =>
            firstValueFrom(this.projectService.Delete(projectId)),
          ),
        );
      }

      this.loadProjects();
    } finally {
      this.isDeletingAllProjects = false;
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private async fetchAllProjectIds(): Promise<string[]> {
    let page = 1;
    const ids: string[] = [];
    const seen = new Set<string>();

    while (page <= 50) {
      const response = (await firstValueFrom(
        this.projectService.Get(page),
      )) as PaginatedResponse<ProjectModel> | ProjectModel[];

      const pageData = Array.isArray(response)
        ? response
        : Array.isArray(response?.data)
          ? response.data
          : [];

      for (const project of pageData) {
        const id = String(project?.id ?? '').trim();
        if (!id || seen.has(id)) {
          continue;
        }

        seen.add(id);
        ids.push(id);
      }

      const hasNextPage =
        !Array.isArray(response) && Boolean(response?.hasNextPage);
      if (!hasNextPage) {
        break;
      }
      page += 1;
    }

    return ids;
  }
}
