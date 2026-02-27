import { HttpBackend, HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { URL_LOGIN, URL_REFRESH } from '../api-ruls/urls';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

type AuthTokensResponse = {
  token: string;
  refreshToken: string;
  tokenExpires: number;
};

type LoginResponse = AuthTokensResponse & {
  user: unknown;
};

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly tokenKey = 'token';
  private readonly refreshTokenKey = 'refreshToken';
  private readonly tokenExpiresKey = 'tokenExpires';
  private readonly userKey = 'user';

  private readonly http = inject(HttpClient);
  private readonly rawHttp = new HttpClient(inject(HttpBackend));

  post(body: unknown) {
    return this.http.post<LoginResponse>(URL_LOGIN, body);
  }

  login(email: string, password: string) {
    return this.http.post<LoginResponse>(URL_LOGIN, { email, password });
  }

  setSession(response: Partial<LoginResponse>): void {
    this.persistTokens(response);

    if (response.user) {
      localStorage.setItem(this.userKey, JSON.stringify(response.user));
    }
  }

  clearSession(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.refreshTokenKey);
    localStorage.removeItem(this.tokenExpiresKey);
    localStorage.removeItem(this.userKey);
  }

  getAccessToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(this.refreshTokenKey);
  }

  getTokenExpires(): number | null {
    const tokenExpiresRaw = localStorage.getItem(this.tokenExpiresKey);
    if (!tokenExpiresRaw) {
      return null;
    }

    const tokenExpires = Number(tokenExpiresRaw);
    return Number.isFinite(tokenExpires) ? tokenExpires : null;
  }

  hasValidAccessToken(graceMs = 15000): boolean {
    const token = this.getAccessToken();
    if (!token) {
      return false;
    }

    const tokenExpires = this.getTokenExpires();
    if (!tokenExpires) {
      return true;
    }

    return Date.now() + graceMs < tokenExpires;
  }

  refreshAccessToken(): Observable<AuthTokensResponse> {
    const refreshToken = this.getRefreshToken();

    if (!refreshToken) {
      return throwError(() => new Error('Refresh token not found'));
    }

    return this.rawHttp
      .post<AuthTokensResponse>(
        URL_REFRESH,
        {},
        {
          headers: new HttpHeaders({
            Authorization: `Bearer ${refreshToken}`,
          }),
        },
      )
      .pipe(
        tap((response) => this.persistTokens(response)),
      );
  }

  ensureValidSession(): Observable<boolean> {
    if (this.hasValidAccessToken()) {
      return of(true);
    }

    if (!this.getRefreshToken()) {
      return of(false);
    }

    return this.refreshAccessToken().pipe(
      map(() => true),
      catchError(() => {
        this.clearSession();
        return of(false);
      }),
    );
  }

  private persistTokens(response: Partial<AuthTokensResponse>): void {
    if (response.token) {
      localStorage.setItem(this.tokenKey, response.token);
    }

    if (response.refreshToken) {
      localStorage.setItem(this.refreshTokenKey, response.refreshToken);
    }

    if (typeof response.tokenExpires === 'number') {
      localStorage.setItem(this.tokenExpiresKey, response.tokenExpires.toString());
    }
  }

  getUserRole(): string | null {
    const userRaw = localStorage.getItem(this.userKey);
    if (!userRaw) return null;

    try {
      const user = JSON.parse(userRaw) as { role?: { name?: string } };
      return user.role?.name ?? null;
    } catch {
      return null;
    }
  }

  getCurrentUserId(): number | null {
    const userRaw = localStorage.getItem(this.userKey);
    if (!userRaw) return null;

    try {
      const user = JSON.parse(userRaw) as { id?: number | string };
      if (typeof user.id === 'number' && Number.isFinite(user.id)) {
        return user.id;
      }
      if (typeof user.id === 'string') {
        const parsed = Number(user.id.trim());
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    } catch {
      return null;
    }
  }

  filterByRole(items: any[]): any[] {
    const userRole = this.getUserRole();
    return items
      .filter((item) => {
        if (!item.roles) return true;
        if (!userRole) return false;
        return item.roles.includes(userRole);
      })
      .map((item) => ({
        ...item,
        items: item.items ? this.filterByRole(item.items) : undefined,
      }))
      .filter((item) => !item.items || item.items.length > 0);
  }
}

