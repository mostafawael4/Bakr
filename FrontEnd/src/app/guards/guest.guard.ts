import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn) {
    return router.createUrlTree(['/home']);
  }

  return auth.sessionChecked$.pipe(
    filter((checked) => checked),
    take(1),
    map(() => (auth.isLoggedIn ? router.createUrlTree(['/home']) : true)),
  );
};
