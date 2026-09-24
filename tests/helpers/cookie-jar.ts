/**
 * In-memory stand-in for `next/headers` cookies() so route handlers that use the
 * actor/admin/invite cookies can be exercised directly. Each jar is one "browser".
 */
export type Jar = Map<string, string>;
let current: Jar = new Map();

export function useJar(jar: Jar): void {
  current = jar;
}
export function newJar(): Jar {
  return new Map();
}

export const nextHeadersMock = {
  cookies: async () => ({
    get: (name: string) => (current.has(name) ? { name, value: current.get(name)! } : undefined),
    set: (name: string, value: string) => {
      current.set(name, value);
    },
    delete: (name: string) => {
      current.delete(name);
    },
    has: (name: string) => current.has(name),
  }),
  headers: async () => new Headers(),
};
