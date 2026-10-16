import { vehicleController } from "@/backend/controllers/dealership.controller";

export const GET = vehicleController.get;
export const PUT = vehicleController.update;
export const POST = vehicleController.action;
export const DELETE = vehicleController.remove;
