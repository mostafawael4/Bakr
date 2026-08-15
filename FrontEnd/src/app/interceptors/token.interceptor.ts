import { HttpInterceptorFn } from '@angular/common/http';

export const tokenInterceptor: HttpInterceptorFn = (req, next) => {
  let token = null;
  try {
    if (typeof window !== 'undefined') {
      token = localStorage.getItem('bakr_token');
    }
  } catch (e) {}
  
  if (token) {
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }
  
  return next(req);
};
