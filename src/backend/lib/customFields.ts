/**
 * Custom fields and dynamic forms support.
 * Store definitions in DB and attach JSON values to entities.
 */
export type CustomFieldDefinition = {
  id: string;
  entity: string; // e.g., 'student', 'course', 'invoice'
  name: string;
  key: string;
  type: "string" | "number" | "boolean" | "date" | "json";
  required?: boolean;
  options?: string[]; // for select-type fields
  createdAt?: string;
};

export class CustomFieldService {
  async registerDefinition(def: Partial<CustomFieldDefinition>): Promise<CustomFieldDefinition> {
    const d: CustomFieldDefinition = {
      id: def.id || `cf_${Date.now()}`,
      entity: def.entity || "",
      name: def.name || "",
      key: def.key || `key_${Date.now()}`,
      type: (def.type as any) || "string",
      required: def.required || false,
      options: def.options || [],
      createdAt: new Date().toISOString(),
    };
    return d;
  }

  async getDefinitionsForEntity(entity: string): Promise<CustomFieldDefinition[]> {
    return [];
  }

  // Save custom data payload for an entity instance (entityId)
  async setCustomData(entity: string, entityId: string, payload: Record<string, any>): Promise<void> {
    // store as JSONB / separate collection as needed
    return;
  }
}

export const customFieldService = new CustomFieldService();
