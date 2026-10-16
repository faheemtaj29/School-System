import { dealerCustomerController } from "@/backend/controllers/dealership.controller";

export const GET = dealerCustomerController.list;
export const POST = dealerCustomerController.create;
