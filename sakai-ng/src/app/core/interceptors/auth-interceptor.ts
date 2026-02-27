import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import {
  catchError,
  finalize,
  map,
  shareReplay,
  switchMap,
} from 'rxjs/operators';
import { URL_REFRESH } from '../services/api-ruls/urls';
import { AuthService } from '../services/auth/auth.service';

let refreshTokenRequest$: Observable<string> | null = null;

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const isRefreshRequest = req.url.startsWith(URL_REFRESH);

  const token = isRefreshRequest
    ? authService.getRefreshToken()
    : authService.getAccessToken();

  const authReq = attachToken(req, token);

  return next(authReq).pipe(
    catchError((error: unknown) => {
      if (
        !(error instanceof HttpErrorResponse) ||
        error.status !== 401 ||
        isRefreshRequest
      ) {
        return throwError(() => error);
      }

      return handleUnauthorized(authReq, next, authService, router);
    }),
  );
};

function handleUnauthorized(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  authService: AuthService,
  router: Router,
): Observable<HttpEvent<unknown>> {
  const refreshToken = authService.getRefreshToken();

  if (!refreshToken) {
    authService.clearSession();
    void router.navigate(['/landing']);
    return throwError(() => new Error('Session expired'));
  }

  if (!refreshTokenRequest$) {
    refreshTokenRequest$ = authService.refreshAccessToken().pipe(
      map((response) => response.token),
      catchError((refreshError: unknown) => {
        authService.clearSession();
        void router.navigate(['/landing']);
        return throwError(() => refreshError);
      }),
      finalize(() => {
        refreshTokenRequest$ = null;
      }),
      shareReplay(1),
    );
  }

  return refreshTokenRequest$.pipe(
    switchMap((newToken) => next(attachToken(req, newToken))),
  );
}

function attachToken(
  req: HttpRequest<unknown>,
  token: string | null,
): HttpRequest<unknown> {
  if (!token) {
    return req;
  }

  return req.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`,
    },
  });
}
