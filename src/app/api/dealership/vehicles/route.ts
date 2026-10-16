import { vehicleController } from "@/backend/controllers/dealership.controller";

export const GET = vehicleController.list;
export const POST = vehicleController.create;
