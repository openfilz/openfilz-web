import { Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { FileExplorerComponent } from './components/file-explorer/file-explorer.component';
import { FavoritesComponent } from './pages/favorites/favorites.component';
import { RecycleBinComponent } from './pages/recycle-bin/recycle-bin.component';
import { WipComponent } from "./components/wip/wip";
import { SettingsComponent } from './pages/settings/settings.component';
import { SearchResultsComponent } from './components/search-results/search-results.component';
import { authGuard } from './guards/auth.guard';
import { recycleBinGuard } from './guards/recycle-bin.guard';
import { signaturesGuard } from './guards/signatures.guard';

// Since we're using standalone components, we need to import them directly in routes
export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' }, // Set dashboard as home page
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'my-folder', component: FileExplorerComponent, canActivate: [authGuard] },
  { path: 'search', component: SearchResultsComponent, canActivate: [authGuard] },
  { path: 'recycle-bin', component: RecycleBinComponent, canActivate: [authGuard, recycleBinGuard] },
  { path: 'favorites', component: FavoritesComponent, canActivate: [authGuard] },
  //{ path: 'shared-files', component: WipComponent },
  { path: 'settings', component: SettingsComponent, canActivate: [authGuard] },
  // e-Sign: authenticated envelope management (hidden when openfilz.signature.active is off)
  { path: 'signatures', loadComponent: () => import('./pages/signatures/signatures.component').then(m => m.SignaturesComponent), canActivate: [authGuard, signaturesGuard] },
  // e-Sign: public signer page reached from the invitation email (?token=...). No auth guard —
  // the token is the authenticator; rendered outside the app shell (see main.ts App component).
  { path: 'sign', loadComponent: () => import('./pages/sign/sign.component').then(m => m.SignComponent) },
  { path: '**', redirectTo: '/dashboard' } // Wildcard route for undefined paths
];