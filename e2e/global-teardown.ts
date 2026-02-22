import { disconnectDatabase } from "./helpers/db";

const globalTeardown = async (): Promise<void> => {
  await disconnectDatabase();
};

export default globalTeardown;
