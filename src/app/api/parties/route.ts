import { partyController } from "@/backend/controllers/party.controller";

export const GET = partyController.list;
export const POST = partyController.create;
export const PUT = partyController.match;
