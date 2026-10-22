export {};

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        role: string;
        org_id: string;
        /** Platform admin working inside a customer org (see signActingToken). */
        acting?: boolean;
      };
    }
  }
}
