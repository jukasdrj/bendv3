import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { enrichAuthorWithWikidata } from "../../src/services/wikidata-enrichment";

// Mock global fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe("Wikidata Enrichment Service", () => {
  let envMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    envMock = {
      CACHE: {
        get: vi.fn(),
        put: vi.fn(),
      },
    };
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("enrichAuthorWithWikidata", () => {
    it("should return cached result if available", async () => {
      const cachedResult = {
        gender: "Female",
        nationality: "United States",
        culturalRegion: "North America",
        birthYear: 1950,
        deathYear: undefined,
        wikidataId: "Q12345",
      };

      envMock.CACHE.get.mockResolvedValue(cachedResult);

      const result = await enrichAuthorWithWikidata("Test Author", envMock);

      expect(envMock.CACHE.get).toHaveBeenCalledWith(
        "wikidata:author:test author",
        "json"
      );
      expect(result).toEqual(cachedResult);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("should return Unknown if author not found in search", async () => {
      envMock.CACHE.get.mockResolvedValue(null);

      // Mock search response: empty result
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ search: [] }),
      });

      const result = await enrichAuthorWithWikidata("Unknown Author", envMock);

      expect(result).toEqual({ gender: "Unknown" });
      expect(envMock.CACHE.put).toHaveBeenCalledWith(
        "wikidata:author:unknown author",
        JSON.stringify({ gender: "Unknown" }),
        expect.objectContaining({ expirationTtl: 604800 })
      );
    });

    it("should enrich author data correctly when found", async () => {
      envMock.CACHE.get.mockResolvedValue(null);

      // 1. Mock Search Response
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          search: [{ id: "Q12345", label: "Test Author" }],
        }),
      });

      // 2. Mock Entity Response (Author)
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entities: {
            Q12345: {
              claims: {
                P21: [
                  {
                    mainsnak: {
                      datavalue: { type: "wikibase-entityid", value: { id: "Q6581072" } }, // Female
                    },
                  },
                ],
                P27: [
                  {
                    mainsnak: {
                      datavalue: { type: "wikibase-entityid", value: { id: "Q30" } }, // USA
                    },
                  },
                ],
                P569: [
                  {
                    mainsnak: {
                      datavalue: { type: "time", value: { time: "+1980-01-01T00:00:00Z" } },
                    },
                  },
                ],
              },
            },
          },
        }),
      });

      // 3. Mock Entity Response (Nationality - USA)
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entities: {
            Q30: {
              labels: {
                en: { value: "United States" },
              },
            },
          },
        }),
      });

      const result = await enrichAuthorWithWikidata("Test Author", envMock);

      expect(result).toEqual({
        gender: "Female",
        nationality: "United States",
        culturalRegion: "North America",
        birthYear: 1980,
        deathYear: undefined,
        wikidataId: "Q12345",
      });

      expect(envMock.CACHE.put).toHaveBeenCalledWith(
        "wikidata:author:test author",
        JSON.stringify(result),
        expect.any(Object)
      );
    });

    it("should handle male gender correctly", async () => {
      envMock.CACHE.get.mockResolvedValue(null);

      // 1. Search
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ search: [{ id: "Q123" }] }),
      });

      // 2. Entity (Male)
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entities: {
            Q123: {
              claims: {
                P21: [{ mainsnak: { datavalue: { type: "wikibase-entityid", value: { id: "Q6581097" } } } }],
              },
            },
          },
        }),
      });

      const result = await enrichAuthorWithWikidata("Male Author", envMock);
      expect(result?.gender).toBe("Male");
    });

    it("should handle non-binary gender correctly", async () => {
      envMock.CACHE.get.mockResolvedValue(null);

      // 1. Search
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ search: [{ id: "Q123" }] }),
      });

      // 2. Entity (Non-binary)
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entities: {
            Q123: {
              claims: {
                P21: [{ mainsnak: { datavalue: { type: "wikibase-entityid", value: { id: "Q48270" } } } }],
              },
            },
          },
        }),
      });

      const result = await enrichAuthorWithWikidata("Nb Author", envMock);
      expect(result?.gender).toBe("Non-binary");
    });

    it("should handle unknown cultural regions", async () => {
      envMock.CACHE.get.mockResolvedValue(null);

      // 1. Search
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ search: [{ id: "Q123" }] }),
      });

      // 2. Entity (Fantasy Country)
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entities: {
            Q123: {
              claims: {
                P27: [{ mainsnak: { datavalue: { type: "wikibase-entityid", value: { id: "Q999" } } } }],
              },
            },
          },
        }),
      });

      // 3. Entity (Fantasy Land)
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entities: {
            Q999: {
              labels: {
                en: { value: "Fantasy Land" },
              },
            },
          },
        }),
      });

      const result = await enrichAuthorWithWikidata("Fantasy Author", envMock);
      expect(result?.nationality).toBe("Fantasy Land");
      expect(result?.culturalRegion).toBeUndefined();
    });

    it("should handle API errors gracefully (Search)", async () => {
      envMock.CACHE.get.mockResolvedValue(null);

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await enrichAuthorWithWikidata("Error Author", envMock);
      expect(result).toEqual({ gender: "Unknown" });
    });

    it("should handle API errors gracefully (Entity)", async () => {
      envMock.CACHE.get.mockResolvedValue(null);

      // Search OK
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ search: [{ id: "Q123" }] }),
      });

      // Entity Error
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await enrichAuthorWithWikidata("Error Author", envMock);
      expect(result).toEqual({ gender: "Unknown" });
    });
  });
});
