import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';
import base from '@primeuix/themes/aura/base';
import accordion from '@primeuix/themes/aura/accordion';
import avatar from '@primeuix/themes/aura/avatar';
import button from '@primeuix/themes/aura/button';
import carousel from '@primeuix/themes/aura/carousel';
import confirmpopup from '@primeuix/themes/aura/confirmpopup';
import datatable from '@primeuix/themes/aura/datatable';
import dialog from '@primeuix/themes/aura/dialog';
import iconfield from '@primeuix/themes/aura/iconfield';
import inputtext from '@primeuix/themes/aura/inputtext';
import menu from '@primeuix/themes/aura/menu';
import message from '@primeuix/themes/aura/message';
import password from '@primeuix/themes/aura/password';
import rating from '@primeuix/themes/aura/rating';
import select from '@primeuix/themes/aura/select';
import selectbutton from '@primeuix/themes/aura/selectbutton';
import skeleton from '@primeuix/themes/aura/skeleton';
import toast from '@primeuix/themes/aura/toast';
import togglebutton from '@primeuix/themes/aura/togglebutton';

/*
 * Aura keeps the tokens of its 90 components in one object that the app evaluates and ships at start-up
 * (about 130 kB of the initial JavaScript). Only the components the app imports are kept here; the
 * spec next to this file fails when a primeng/<component> import has no tokens, and when they differ from Aura's.
 */
const auraSlim: typeof Aura = {
  ...base,
  components: {
    accordion,
    avatar,
    button,
    carousel,
    confirmpopup,
    datatable,
    dialog,
    iconfield,
    inputtext,
    menu,
    message,
    password,
    rating,
    select,
    selectbutton,
    skeleton,
    toast,
    togglebutton,
  },
};

/*
 * PrimeNG preset that mirrors src/styles/theme.css (the approved mockup values).
 * Dark only: values live under colorScheme.dark and the app root has class "app-dark".
 * Raw hex is allowed here (and in theme.css) and nowhere else.
 */
const line = 'rgba(255,255,255,.10)';
const lineStrong = 'rgba(255,255,255,.20)';
const hover = 'rgba(255,255,255,.08)';

// The keyboard-focused row of the account menu. One function, so the slim and the full preset compare equal.
const menuFocusRing = () =>
  '.p-menu-item.p-focus > .p-menu-item-content { outline: 2px solid #A9B5F6; outline-offset: -2px; }';

// Quiet status message: tinted fill, hairline border in the status hue, status text colour.
const statusMessage = (fill: string, text: string) => ({
  background: `color-mix(in srgb, ${fill}, transparent 85%)`,
  borderColor: `color-mix(in srgb, ${fill}, transparent 55%)`,
  color: text,
  shadow: 'none',
});

export const buildCinevaultPreset = (aura: typeof Aura) =>
  definePreset(aura, {
    primitive: {
      borderRadius: { none: '0', xs: '4px', sm: '4px', md: '6px', lg: '8px', xl: '8px' },
    },
    components: {
      message: {
        colorScheme: {
          dark: {
            error: statusMessage('#B3424B', '#E58B8B'),
            success: statusMessage('#3E8F6A', '#7DC7A3'),
            warn: statusMessage('#9C7A3A', '#D6B170'),
          },
        },
      },
      // The mockup's single score star: 12px, quiet (text-2), not the accent.
      rating: {
        root: { gap: '0.25rem' },
        icon: { size: '0.75rem', activeColor: '#A7ABB6', color: '#A7ABB6' },
      },
      // Season panels (mockup .seasons): flat rows between hairlines, 56px headers, no fills.
      accordion: {
        panel: { borderColor: line },
        header: {
          padding: '1rem 0',
          fontWeight: '500',
          color: '#ECEDF0',
          hoverColor: '#ECEDF0',
          activeColor: '#ECEDF0',
          activeHoverColor: '#ECEDF0',
          background: 'transparent',
          hoverBackground: 'transparent',
          activeBackground: 'transparent',
          activeHoverBackground: 'transparent',
          toggleIcon: { color: '#8D92A0', hoverColor: '#ECEDF0', activeColor: '#8D92A0' },
          focusRing: { offset: '2px' },
        },
        content: { background: 'transparent', padding: '0 0 0.5rem 0' },
      },
      // Filter pills (mockup .seg-tabs): the frame is drawn by the page; each pill is flat text, the chosen one a
      // raised surface-4 fill. The selectbutton's own radius is the pill radius.
      selectbutton: { root: { borderRadius: '6px' } },
      togglebutton: {
        root: {
          padding: '0',
          borderRadius: '6px',
          gap: '0.5rem',
          fontWeight: '500',
          fontSize: '0.875rem',
          background: 'transparent',
          checkedBackground: 'transparent',
          hoverBackground: 'transparent',
          borderColor: 'transparent',
          checkedBorderColor: 'transparent',
          color: '#A7ABB6',
          hoverColor: '#ECEDF0',
          checkedColor: '#ECEDF0',
        },
        content: {
          padding: '0.4375rem 1rem',
          borderRadius: '6px',
          checkedBackground: '#22262D',
          checkedShadow: 'none',
        },
      },
      // Cast initials (mockup .avatar): neutral surface, quiet text, 36px.
      avatar: {
        root: {
          width: '2.25rem',
          height: '2.25rem',
          fontSize: '0.75rem',
          fontWeight: '500',
          background: '#22262D',
          color: '#A7ABB6',
        },
      },
      // Admin users table (mockup .utable): no fills, a hairline under the header and under each row, the row
      // lightens on hover. The cell padding keeps the right-hand gap only, so the columns breathe like the mockup.
      datatable: {
        headerCell: {
          background: 'transparent',
          hoverBackground: 'transparent',
          selectedBackground: 'transparent',
          color: '#8D92A0',
          hoverColor: '#8D92A0',
          borderColor: line,
          padding: '0 1rem 0.75rem 0',
        },
        columnTitle: { fontWeight: '500', fontSize: '0.75rem' },
        row: { background: 'transparent', hoverBackground: 'rgba(255,255,255,.05)' },
        bodyCell: { borderColor: 'rgba(255,255,255,.06)', padding: '0.75rem 1rem 0.75rem 0' },
      },
      // Toast (mockup .toast): raised surface, strong hairline, no shadow.
      toast: {
        root: { width: '32.5rem', borderRadius: '8px' },
        secondary: {
          background: '#22262D',
          borderColor: lineStrong,
          color: '#ECEDF0',
          detailColor: '#A7ABB6',
          shadow: 'none',
        },
      },
      // Account menu (mockup .menu): surface-3 panel with a hairline, no shadow, 4px inside, 44px rows with
      // a 12px icon gap, quiet text that lights up on hover. The keyboard-focused row gets the focus ring.
      menu: {
        root: { background: '#1A1D23', borderColor: line, borderRadius: '8px', shadow: 'none' },
        list: { padding: '4px', gap: '0' },
        item: {
          padding: '0.71875rem 0.75rem',
          borderRadius: '6px',
          gap: '0.75rem',
          color: '#A7ABB6',
          focusColor: '#ECEDF0',
          focusBackground: hover,
          icon: { color: '#A7ABB6', focusColor: '#ECEDF0', size: '1.125rem' },
          label: { fontWeight: '500', fontSize: '0.875rem' },
        },
        separator: { borderColor: 'rgba(255,255,255,.06)' },
        css: menuFocusRing,
      },
      button: {
        root: { fontSize: '0.875rem', paddingX: '1.25rem', paddingY: '0.53125rem' },
        colorScheme: {
          dark: {
            text: {
              secondary: { color: '#A7ABB6', hoverBackground: hover, activeBackground: hover },
            },
            outlined: {
              secondary: {
                color: '#ECEDF0',
                borderColor: lineStrong,
                hoverBackground: hover,
                activeBackground: hover,
              },
            },
          },
        },
      },
    },
    semantic: {
      transitionDuration: '0.15s',
      typography: { fontFamily: 'var(--font-sans)' },
      formField: { fontSize: '1rem', paddingX: '0.75rem', paddingY: '0.4375rem' },
      focusRing: { width: '2px', style: 'solid', color: '#A9B5F6', offset: '2px', shadow: 'none' },
      primary: {
        50: '#F4F5FE',
        100: '#E6E9FC',
        200: '#CDD3F8',
        300: '#A9B5F6',
        400: '#7F8EE9',
        500: '#4C60C8',
        600: '#4254B1',
        700: '#38489A',
        800: '#2E3B7E',
        900: '#242E63',
        950: '#1A2149',
      },
      colorScheme: {
        dark: {
          primary: {
            color: '{primary.500}',
            contrastColor: '#F7F8FF',
            hoverColor: '#5A6ED3',
            activeColor: '{primary.600}',
          },
          surface: {
            0: '#ECEDF0',
            50: '#ECEDF0',
            100: '#D4D6DC',
            200: '#BFC2CB',
            300: '#A7ABB6',
            400: '#8D92A0',
            500: '#767B89',
            600: '#22262D',
            700: '#1A1D23',
            800: '#14161B',
            900: '#0E1014',
            950: '#0A0B0E',
          },
          text: {
            color: '#ECEDF0',
            hoverColor: '#ECEDF0',
            mutedColor: '#A7ABB6',
            hoverMutedColor: '#ECEDF0',
          },
          content: {
            background: '#14161B',
            hoverBackground: hover,
            borderColor: line,
            color: '#ECEDF0',
            hoverColor: '#ECEDF0',
          },
          formField: {
            background: '#14161B',
            disabledBackground: '#1A1D23',
            filledBackground: '#14161B',
            filledHoverBackground: '#1A1D23',
            filledFocusBackground: '#1A1D23',
            borderColor: line,
            hoverBorderColor: lineStrong,
            focusBorderColor: lineStrong,
            color: '#ECEDF0',
            disabledColor: '#8D92A0',
            placeholderColor: '#8D92A0',
            floatLabelColor: '#8D92A0',
            floatLabelFocusColor: '#A7ABB6',
            floatLabelActiveColor: '#A7ABB6',
            iconColor: '#8D92A0',
            shadow: 'none',
          },
          highlight: {
            background: 'color-mix(in srgb, #4C60C8, transparent 70%)',
            focusBackground: 'color-mix(in srgb, #4C60C8, transparent 60%)',
            color: '#ECEDF0',
            focusColor: '#ECEDF0',
          },
          mask: { background: 'rgba(0,0,0,.6)', color: '#A7ABB6' },
          overlay: {
            select: {
              background: '#1A1D23',
              borderColor: line,
              color: '#ECEDF0',
              shadow: 'none',
            },
            popover: {
              background: '#1A1D23',
              borderColor: line,
              color: '#ECEDF0',
              shadow: 'none',
            },
            modal: { background: '#14161B', borderColor: line, color: '#ECEDF0', shadow: 'none' },
          },
          list: {
            option: {
              focusBackground: hover,
              selectedBackground: 'color-mix(in srgb, #4C60C8, transparent 70%)',
              selectedFocusBackground: 'color-mix(in srgb, #4C60C8, transparent 60%)',
            },
          },
          navigation: {
            item: {
              focusBackground: hover,
              activeBackground: hover,
            },
          },
        },
      },
    },
  });

export default buildCinevaultPreset(auraSlim);
