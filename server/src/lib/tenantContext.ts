import { AsyncLocalStorage } from "async_hooks";

interface TenantContext {
  org_id: string;
}

const als = new AsyncLocalStorage<TenantContext>();

export function runWithOrg<T>(org_id: string, fn: () => T): T {
  return als.run({ org_id }, fn);
}

export function getCurrentOrgId(): string | undefined {
  return als.getStore()?.org_id;
}
