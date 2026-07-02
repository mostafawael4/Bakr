import { ApplicationConfig, Injectable } from '@angular/core';
import { provideRouter, withInMemoryScrolling, TitleStrategy, RouterStateSnapshot } from '@angular/router';
import { provideClientHydration, Title } from '@angular/platform-browser';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { routes } from './app.routes';

@Injectable({ providedIn: 'root' })
export class TemplatePageTitleStrategy extends TitleStrategy {
  constructor(private readonly title: Title) {
    super();
  }

  override updateTitle(routerState: RouterStateSnapshot) {
    const title = this.buildTitle(routerState);
    if (title !== undefined) {
      this.title.setTitle(`${title.toUpperCase()} | ABO BAKR`);
    } else {
      this.title.setTitle('ABO BAKR');
    }
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withInMemoryScrolling({
      scrollPositionRestoration: 'top',
      anchorScrolling: 'enabled'
    })),
    provideClientHydration(),
    provideHttpClient(withFetch()),
    { provide: TitleStrategy, useClass: TemplatePageTitleStrategy },
  ],
};
