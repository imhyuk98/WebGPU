export enum MaterialType {
    LAMBERTIAN = 0,    // 무광 (난반사)
    METAL = 1          // 금속 (완전 반사)
}

export interface Material {
    type: MaterialType;
    // roughness 제거 - 단순하게 유지
}

// ✅ 단순한 2가지 재질만
export const MaterialTemplates = {
    // 무광 재질 (램버트 산란)
    MATTE: { 
        type: MaterialType.LAMBERTIAN 
    } as Material,
    
    // 완전 반사 재질 (거울)
    MIRROR: { 
        type: MaterialType.METAL
    } as Material
};