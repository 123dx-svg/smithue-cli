export interface OwnershipConfig {
  include?: string[];
  exclude?: string[];
}

export interface SmithUEConfig {
  specsDir: string;
  devContentRoot?: string;
  ownership?: OwnershipConfig;
}
