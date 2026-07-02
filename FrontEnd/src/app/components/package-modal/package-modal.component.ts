import { Component, EventEmitter, Input, Output, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Package } from '../../services/package.service';

@Component({
  selector: 'app-package-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './package-modal.component.html',
  styleUrls: ['./package-modal.component.scss'],
})
export class PackageModalComponent implements OnChanges {
  @Input() visible = false;
  @Input() editPackage: Package | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<Partial<Package>>();

  form = {
    name: '',
    hours: 1,
    price: 0,
    currency: 'EGP',
    description: '',
    photographers: 1,
    includesMainPhotographer: true,
    order: 0,
  };

  get isEdit(): boolean {
    return this.editPackage !== null;
  }

  ngOnChanges(): void {
    if (this.editPackage) {
      this.form = {
        name: this.editPackage.name,
        hours: this.editPackage.hours,
        price: this.editPackage.price,
        currency: this.editPackage.currency,
        description: this.editPackage.description,
        photographers: this.editPackage.photographers,
        includesMainPhotographer: this.editPackage.includesMainPhotographer,
        order: this.editPackage.order,
      };
    } else {
      this.resetForm();
    }
  }

  close(): void {
    this.closed.emit();
  }

  submit(): void {
    if (!this.form.name || !this.form.hours || !this.form.price) return;
    this.saved.emit({ ...this.form });
  }

  private resetForm(): void {
    this.form = {
      name: '',
      hours: 1,
      price: 0,
      currency: 'EGP',
      description: '',
      photographers: 1,
      includesMainPhotographer: true,
      order: 0,
    };
  }
}
