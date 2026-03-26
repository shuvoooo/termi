/**
 * Browser Credential Management API type declarations.
 * These are Stage 3 / not yet in all TS lib versions.
 */

interface PasswordCredential extends Credential {
    readonly password: string;
    readonly name: string;
    readonly iconURL: string;
}

declare var PasswordCredential: {
    prototype: PasswordCredential;
    new(data: { id: string; password: string; name?: string }): PasswordCredential;
    new(form: HTMLFormElement): PasswordCredential;
};

interface CredentialsContainer {
    get(options?: CredentialRequestOptions & { password?: boolean }): Promise<Credential | null>;
    store(credential: Credential): Promise<Credential>;
}

