import { Routes } from '@angular/router';
import { AppLayout } from './app/layout/component/app.layout';
import { Dashboard } from './app/pages/dashboard/dashboard';
import { Documentation } from './app/pages/documentation/documentation';
import { Landing } from './app/pages/landing/landing';
import { Notfound } from './app/pages/notfound/notfound';
import { authGuard } from './app/guards/auth.guard';
import { roleGuard } from './app/guards/role.guard';

export const appRoutes: Routes = [
    {
        path: '',
        component: AppLayout,
        canActivate: [authGuard],
        canActivateChild: [authGuard],
        children: [
            {
                path: '',
                component: Dashboard,
                canActivate: [roleGuard],
                data: {roles: ['Admin', 'User']}
            },

            {
                path: 'uikit',
                canActivate: [roleGuard],
                data: {roles: ['Admin']},
                loadChildren: () => import('./app/pages/uikit/uikit.routes')
            },
            {
                path: 'documentation',
                canActivate: [roleGuard],
                data: { roles: ['Admin'] },
                component: Documentation
            },
            {
                path: 'pages',
                canActivate: [roleGuard],
                data: { roles: ['Admin', 'User'] },
                loadChildren: () => import('./app/pages/pages.routes')

            }
        ]
    },
    { path: 'landing', component: Landing },
    { path: 'notfound', component: Notfound },
    { path: 'auth', loadChildren: () => import('./app/pages/auth/auth.routes') },
    { path: '**', redirectTo: '/notfound' }
];
