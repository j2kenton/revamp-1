/**
 * Ambient type declarations for the Google Identity Services (GIS) client library.
 * @see https://developers.google.com/identity/gsi/web/reference/js-reference
 */

interface CredentialResponse {
  /** Base64url-encoded, dot-separated JWT ID token. */
  credential: string;
  /**
   * How the credential was selected. Google documents a fixed set of values;
   * the `(string & {})` widening keeps unlisted/future values assignable
   * without losing autocomplete for the documented ones.
   */
  select_by?:
    | 'auto'
    | 'user'
    | 'user_1tap'
    | 'user_2tap'
    | 'btn'
    | 'btn_confirm'
    | 'btn_add_session'
    | 'btn_confirm_add_session'
    | (string & {});
  clientId?: string;
}

interface PromptMomentNotification {
  isDisplayMoment(): boolean;
  isDisplayed(): boolean;
  isNotDisplayed(): boolean;
  getNotDisplayedReason():
    | 'browser_not_supported'
    | 'invalid_client'
    | 'missing_client_id'
    | 'opt_out_or_no_session'
    | 'secure_http_required'
    | 'suppressed_by_user'
    | 'unregistered_origin'
    | 'unknown_reason'
    | (string & {});
  isSkippedMoment(): boolean;
  getSkippedReason():
    | 'auto_cancel'
    | 'user_cancel'
    | 'tap_outside'
    | 'issuing_failed'
    | (string & {});
  isDismissedMoment(): boolean;
  getDismissedReason():
    | 'credential_returned'
    | 'cancel_called'
    | 'flow_restarted'
    | (string & {});
  getMomentType(): 'display' | 'skipped' | 'dismissed' | (string & {});
}

interface GoogleAccountsIdConfiguration {
  client_id: string;
  callback: (response: CredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  context?: 'signin' | 'signup' | 'use';
  itp_support?: boolean;
  use_fedcm_for_prompt?: boolean;
}

interface GsiButtonConfiguration {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: string | number;
  locale?: string;
}

interface GoogleAccountsId {
  initialize(config: GoogleAccountsIdConfiguration): void;
  prompt(momentListener?: (notification: PromptMomentNotification) => void): void;
  renderButton(parent: HTMLElement, options: GsiButtonConfiguration): void;
  disableAutoSelect(): void;
  storeCredential(credential: { id: string; password: string }, callback?: () => void): void;
  cancel(): void;
  revoke(hint: string, callback?: (response: { successful: boolean; error?: string }) => void): void;
}

interface Window {
  google?: {
    accounts: {
      id: GoogleAccountsId;
    };
  };
}
