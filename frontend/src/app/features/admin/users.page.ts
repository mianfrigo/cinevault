import { DatePipe, DOCUMENT, isPlatformBrowser, ViewportScroller } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  PLATFORM_ID,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { form, FormField, maxLength } from '@angular/forms/signals';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { ConfirmPopupModule } from 'primeng/confirmpopup';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { AuthStore } from '@core/auth/auth.store';
import { Role, UserDto } from '@core/models';
import { initials } from '@shared/utils/initials';
import { plural } from '@shared/utils/plural';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { PaginatorComponent } from '@shared/components/paginator/paginator.component';
import { StateBlockComponent } from '@shared/components/state-block/state-block.component';
import { adminFailure } from './admin.messages';
import { RoleSelectComponent } from './role-select.component';
import { QUERY_MAX, UsersPageStore } from './users-page.store';
import { UserStatusComponent } from './user-status.component';

/** A row with what the template needs to know about it, so the template holds no logic. */
interface Row {
  id: string;
  user: UserDto;
  /** The signed-in admin's own row: its role, block and delete controls are off (the API refuses them anyway). */
  own: boolean;
  busy: boolean;
  blocked: boolean;
  roleLabel: string;
  blockLabel: string;
  deleteLabel: string;
}

const REASON = {
  role: 'You cannot change your own role',
  block: 'You cannot block yourself',
  delete: 'You cannot delete yourself',
};

/** Placeholder rows of the loading state: the table keeps its height, so nothing jumps when the users arrive. */
const SKELETON_ROWS = Array.from({ length: 8 }, (_, i) => i);

/** Table that stacks into one card per user below 768px (mockup .utable): the header goes, each row becomes a grid. */
const TABLE = 'w-full max-md:block max-md:[&_tbody]:block max-md:[&_thead]:sr-only';
const TH = 'text-left text-micro font-medium tracking-micro whitespace-nowrap uppercase';
const ROW =
  "max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-center max-md:gap-3 max-md:border-b max-md:border-line-soft max-md:py-3 max-md:[grid-template-areas:'user_status'_'role_joined'_'acts_acts']";
const CELL = 'align-middle text-sm md:whitespace-nowrap max-md:block max-md:border-0 max-md:p-0!';
/** The user column takes the rest of the row and clips a long name or address (max-w-0 lets the cell shrink). */
const USER_CELL = CELL + ' md:w-full md:max-w-0 max-md:min-w-0 max-md:[grid-area:user]';

/**
 * /admin/users: search, change role, block or unblock, delete. The store holds the list (nothing user specific
 * renders on the server: it has no session, so the page stays on its skeleton). The search and the page are
 * not in the URL: they live in the store, and leaving the page starts again at the first page.
 */
@Component({
  selector: 'cv-users-page',
  imports: [
    DatePipe,
    FormField,
    AvatarModule,
    ButtonModule,
    ConfirmPopupModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    SkeletonModule,
    TableModule,
    ToastModule,
    PageHeaderComponent,
    PaginatorComponent,
    StateBlockComponent,
    RoleSelectComponent,
    UserStatusComponent,
  ],
  // Its own services: the toast and the confirm popup of this page show nothing else.
  providers: [UsersPageStore, MessageService, ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <cv-page-header title="Users" lead="Change roles, block access, or remove accounts." />

    <div class="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div class="w-full md:max-w-110">
        <label for="user-search" class="sr-only">Search users by name or email</label>
        <p-iconfield class="block">
          <p-inputicon class="pi pi-search" />
          <input
            id="user-search"
            pInputText
            type="search"
            class="w-full"
            placeholder="Search by name or email"
            autocomplete="off"
            enterkeyhint="search"
            [formField]="searchForm.q"
          />
        </p-iconfield>
      </div>
      <!-- min-h keeps the line's place while the count is not known yet. -->
      <p class="min-h-5 text-sm text-fg-3 tabular-nums" aria-live="polite">{{ count() }}</p>
    </div>

    @if (store.status() === 'error') {
      <cv-state
        kind="error"
        message="Could not load users. Check your connection and try again."
        (retry)="store.reload()"
      />
    } @else if (store.status() === 'loading' && store.items().length === 0) {
      <div role="status" aria-busy="true">
        <span class="sr-only">Loading</span>
        <div class="border-t border-line-soft" aria-hidden="true">
          @for (n of skeletonRows; track n) {
            <div class="flex h-[3.8125rem] items-center gap-3 border-b border-line-soft">
              <p-skeleton shape="circle" size="2.25rem" />
              <div class="grid flex-1 gap-1.5">
                <p-skeleton width="30%" height="0.875rem" />
                <p-skeleton width="45%" height="0.8125rem" />
              </div>
              <p-skeleton class="max-md:hidden" width="6.5rem" height="2rem" />
            </div>
          }
        </div>
      </div>
    } @else if (store.items().length === 0) {
      <p class="border-t border-line-soft px-3 py-12 text-center text-sm text-fg-2">
        @if (store.query()) {
          No users match “{{ store.query() }}”. Try a name or part of an email address.
        } @else {
          There are no users yet.
        }
      </p>
    } @else {
      <!-- While the next list loads, the previous one stays (dimmed) so keyboard focus is not lost. -->
      <div
        [attr.aria-busy]="store.status() === 'loading'"
        class="transition-opacity duration-150"
        [class.opacity-60]="store.status() === 'loading'"
      >
        <p-table
          [value]="rows()"
          dataKey="id"
          [lazy]="true"
          [lazyLoadOnInit]="false"
          [rows]="20"
          [totalRecords]="store.total()"
          [tableStyleClass]="tableClass"
          [rowTrackBy]="trackRow"
        >
          <ng-template #header>
            <tr>
              <th scope="col" [class]="th">User</th>
              <th scope="col" [class]="th">Role</th>
              <th scope="col" [class]="th">Status</th>
              <th scope="col" [class]="th">Joined</th>
              <th scope="col" [class]="th"><span class="sr-only">Actions</span></th>
            </tr>
          </ng-template>
          <ng-template #body let-row>
            <tr [class]="rowClass">
              <td [class]="userCell">
                <div class="flex min-w-0 items-center gap-3">
                  <p-avatar
                    [label]="initials(row.user.name)"
                    shape="circle"
                    aria-hidden="true"
                    [class.opacity-60]="row.blocked"
                  />
                  <div class="min-w-0">
                    <b
                      class="block truncate leading-[1.3] font-medium"
                      [class.opacity-60]="row.blocked"
                    >
                      {{ row.user.name }}
                      @if (row.own) {
                        <span class="ml-2 text-micro font-medium text-fg-3">You</span>
                      }
                    </b>
                    <small class="block truncate text-label text-fg-3">{{ row.user.email }}</small>
                  </div>
                </div>
              </td>
              <td [class]="cell + ' max-md:[grid-area:role]'">
                <span class="mb-1 block text-micro text-fg-3 md:hidden">Role</span>
                <span class="block w-fit" [attr.title]="row.own ? reason.role : null">
                  <cv-role-select
                    [role]="row.user.role"
                    [label]="row.roleLabel"
                    [disabled]="row.own || row.busy"
                    [busy]="row.busy"
                    (roleChange)="changeRole(row.user, $event)"
                  />
                </span>
              </td>
              <td [class]="cell + ' max-md:[grid-area:status] max-md:justify-self-end'">
                <cv-user-status [status]="row.user.status" />
              </td>
              <td
                [class]="
                  cell +
                  ' tabular-nums max-md:flex max-md:items-center max-md:gap-2 max-md:[grid-area:joined] max-md:justify-self-end max-md:whitespace-nowrap max-md:text-fg-2'
                "
              >
                <span class="text-fg-3 md:hidden">Joined</span>
                <time [attr.datetime]="row.user.createdAt">{{
                  row.user.createdAt | date: 'd MMM y' : 'UTC'
                }}</time>
              </td>
              <td [class]="cell + ' md:pr-0! md:whitespace-nowrap max-md:[grid-area:acts]'">
                <div class="flex justify-end gap-2 max-md:grid max-md:grid-cols-2">
                  <span class="block" [attr.title]="row.own ? reason.block : null">
                    <p-button
                      [class]="btn"
                      [label]="row.blocked ? 'Unblock' : 'Block'"
                      severity="secondary"
                      variant="outlined"
                      size="small"
                      [ariaLabel]="row.blockLabel"
                      [disabled]="row.own || row.busy"
                      (onClick)="toggleBlock(row.user)"
                    />
                  </span>
                  <span class="block" [attr.title]="row.own ? reason.delete : null">
                    <p-button
                      [class]="
                        btn + ' hover:[&_button]:border-danger/50 hover:[&_button]:text-danger'
                      "
                      label="Delete"
                      severity="secondary"
                      variant="outlined"
                      size="small"
                      [ariaLabel]="row.deleteLabel"
                      [disabled]="row.own || row.busy"
                      (onClick)="confirmDelete($event, row.user)"
                    />
                  </span>
                </div>
              </td>
            </tr>
          </ng-template>
        </p-table>
        <cv-paginator
          [page]="store.page()"
          [totalPages]="store.totalPages()"
          (pageChange)="goTo($event)"
        />
      </div>
    }

    <p-confirmpopup />
    <p-toast key="admin" position="bottom-center" class="max-lg:bottom-20!" />
  `,
})
export default class UsersPage {
  protected readonly store = inject(UsersPageStore);
  private readonly auth = inject(AuthStore);
  private readonly messages = inject(MessageService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly scroller = inject(ViewportScroller);
  private readonly injector = inject(Injector);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly heading = viewChild.required(PageHeaderComponent);
  private readonly doc = inject(DOCUMENT);

  protected readonly initials = initials;
  protected readonly skeletonRows = SKELETON_ROWS;
  protected readonly tableClass = TABLE;
  protected readonly th = TH;
  protected readonly rowClass = ROW;
  protected readonly cell = CELL;
  protected readonly userCell = USER_CELL;
  protected readonly btn =
    'block [--p-button-sm-font-size:0.875rem] [--p-button-sm-padding-y:0.4375rem] max-md:[&_button]:min-h-11 max-md:[&_button]:w-full';
  protected readonly reason = REASON;
  /** By id: a row that changes (busy, a new role) keeps its DOM, so the keyboard stays where it is. */
  protected readonly trackRow = (_: number, row: Row) => row.id;

  // The search box is a Signal Forms field; the store waits for a pause in typing before it asks.
  private readonly searchModel = signal({ q: '' });
  // maxLength puts the limit on the input; the store caps what it asks for in any case.
  protected readonly searchForm = form(this.searchModel, (p) => maxLength(p.q, QUERY_MAX));

  protected readonly rows = computed<Row[]>(() => {
    const me = this.auth.user()?.id;
    const busy = this.store.busyIds();
    return this.store.items().map((user) => {
      const own = user.id === me;
      const blocked = user.status === 'BLOCKED';
      return {
        id: user.id,
        user,
        own,
        busy: busy.includes(user.id),
        blocked,
        roleLabel: `Role for ${user.name}`,
        blockLabel: `${blocked ? 'Unblock' : 'Block'} ${user.name}${own ? ` (${REASON.block.toLowerCase()})` : ''}`,
        deleteLabel: `Delete ${user.name}${own ? ` (${REASON.delete.toLowerCase()})` : ''}`,
      };
    });
  });

  /** "12 users" (the matches of the search, all pages); empty while there is nothing to count yet. */
  protected readonly count = computed(() => {
    if (this.store.status() === 'error' || this.store.items().length === 0) return '';
    const n = this.store.total();
    return `${n} ${plural(n, 'user')}`;
  });

  constructor() {
    // Only a logged in browser asks for the list: the server has no session, so it renders the skeleton.
    effect(() => {
      if (!this.auth.isLoggedIn()) return;
      untracked(() => this.store.reload());
    });
    effect(() => {
      const q = this.searchForm.q().value();
      untracked(() => this.store.setQuery(q));
    });
  }

  protected goTo(page: number): void {
    this.store.setPage(page);
    this.scroller.scrollToPosition([0, 0]);
  }

  protected async changeRole(user: UserDto, role: Role): Promise<void> {
    if (role === user.role) return;
    await this.keepFocus(async () => this.report(await this.store.changeRole(user.id, role)));
  }

  protected async toggleBlock(user: UserDto): Promise<void> {
    const block = user.status !== 'BLOCKED';
    await this.keepFocus(async () => {
      const failed = await this.store.setStatus(user.id, block ? 'BLOCKED' : 'ACTIVE');
      if (this.report(failed)) return;
      this.toast(
        block ? `${user.name} is blocked and signed out.` : `${user.name} can log in again.`,
      );
    });
  }

  /** Delete asks first: nothing is sent until "Delete" is chosen in the popup (Escape or a click outside cancels). */
  protected confirmDelete(event: Event, user: UserDto): void {
    const origin = event.currentTarget as HTMLElement;
    // The popup returns focus to its target on Cancel and Escape, so the target is the button itself.
    const trigger = origin.matches('button') ? origin : (origin.querySelector('button') ?? origin);
    this.confirmation.confirm({
      target: trigger,
      message: `Delete ${user.name} and their favorites?`,
      defaultFocus: 'reject',
      acceptButtonProps: { label: 'Delete', severity: 'danger' },
      rejectButtonProps: {
        label: 'Cancel',
        severity: 'secondary',
        variant: 'outlined',
        size: 'small',
      },
      accept: () => void this.remove(user, trigger),
    });
  }

  private async remove(user: UserDto, trigger: HTMLElement): Promise<void> {
    const failed = await this.store.remove(user.id);
    if (this.report(failed)) {
      this.focusLater(trigger); // the row is still there: the keyboard goes back to its Delete button
      return;
    }
    this.toast(`Deleted ${user.name} and their favorites.`);
    // The Delete button is gone with its row: the keyboard goes to the page heading rather than to the body.
    this.focusLater(this.heading());
  }

  /** Shows the failure of a change in the toast. True when there was one ('BUSY' sent nothing: say nothing). */
  private report(code: string | null): boolean {
    if (code === null) return false;
    if (code !== 'BUSY')
      this.messages.add({
        key: 'admin',
        severity: 'error',
        summary: adminFailure(code),
        life: 6000,
      });
    return true;
  }

  private toast(summary: string): void {
    this.messages.add({ key: 'admin', severity: 'secondary', summary, life: 4000 });
  }

  /**
   * A control that is disabled while its request runs would drop the keyboard onto the page body: put the
   * focus back on whatever had it once the request has ended and the control is enabled again.
   */
  private async keepFocus(task: () => Promise<unknown>): Promise<void> {
    const doc = this.doc;
    const active = doc.activeElement as HTMLElement | null;
    await task();
    if (active && active !== doc.body) this.focusLater(active);
  }

  private focusLater(target: { focus(): void; isConnected?: boolean }): void {
    if (!this.browser) return;
    afterNextRender(() => (target.isConnected !== false ? target.focus() : undefined), {
      injector: this.injector,
    });
  }
}
