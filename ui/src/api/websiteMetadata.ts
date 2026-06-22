import { api } from "./client";

export interface WebsiteMetadata {
  url: string;
  siteName: string | null;
  iconUrl: string | null;
}

export const websiteMetadataApi = {
  get: (url: string) => api.get<WebsiteMetadata>(`/website-metadata?url=${encodeURIComponent(url)}`),
};
