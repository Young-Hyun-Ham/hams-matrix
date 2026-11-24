// Builder presentation settings, not an authorization identity.
export type User = {
  id: string;
  sub?: string;
  email?: string | null;
  username?: string;
  roles?: string[];
  unuseFormElements?: string[];
  unuseNodes?: string[];
  nodeColors?: Record<string, string>;
};
