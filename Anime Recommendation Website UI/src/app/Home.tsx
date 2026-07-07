import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { HeroSearch } from './components/HeroSearch';
import { AnimeGrid } from './components/AnimeGrid';
import { AnimeModal } from './components/AnimeModal';

import { 
  fetchTopAnime, 
  fetchRecommendationsByTitle, 
  fetchRecommendationsByGenreTheme, 
  Anime 
} from '../lib/api';

export const Home = () => {
  const [topAnime, setTopAnime] = useState<Anime[]>([]);
  const [recommendations, setRecommendations] = useState<Anime[]>([]);
  const [isSearchingActive, setIsSearchingActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAnime, setSelectedAnime] = useState<Anime | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [recommendationTitle, setRecommendationTitle] = useState<string>("Trending Now");

  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      try {
        const top = await fetchTopAnime();
        setTopAnime(top);
      } catch (error) {
        console.error("Gagal memuat data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadInitialData();
  }, []);

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setIsSearchingActive(false);
      return;
    }
    
    setIsSearching(true);
    setIsSearchingActive(true);
    try {
      const results = await fetchRecommendationsByTitle(query);
      setRecommendations(results);
      setRecommendationTitle(results.length > 0 ? `Results for "${query}"` : "No results found");
    } catch (error) {
      setRecommendations([]);
      setRecommendationTitle("Error fetching recommendations");
    } finally {
      setIsSearching(false);
    }
  };

  const handleGenreThemeFilter = async (genres: string[], themes: string[]) => {
    if (genres.length === 0 && themes.length === 0) {
      setIsSearchingActive(false);
      return;
    }

    setIsSearching(true);
    setIsSearchingActive(true);
    try {
      const results = await fetchRecommendationsByGenreTheme(genres, themes);
      setRecommendations(results);
      setRecommendationTitle(results.length > 0 ? "Filtered Results" : "No results for these filters");
    } catch (error) {
      setRecommendations([]);
      setRecommendationTitle("Error fetching filter results");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#030305] text-white selection:bg-purple-500/30 font-sans">
      <Navbar />
      
      <main className="pb-24">
        <HeroSearch onSearch={handleSearch} onFilterChange={handleGenreThemeFilter} />

        {isSearching ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
          </div>
        ) : isSearchingActive ? (
          <AnimeGrid 
            title={recommendationTitle} 
            items={recommendations} 
            onItemClick={(anime) => setSelectedAnime(anime)} 
            isRecommendationSection={true}
          />
        ) : isLoading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
          </div>
        ) : (
          <>
            <AnimeGrid 
              title="Trending Now" 
              items={topAnime} 
              onItemClick={(anime) => setSelectedAnime(anime)} 
            />
          </>
        )}
      </main>

      <AnimeModal anime={selectedAnime} onClose={() => setSelectedAnime(null)} />
    </div>
  );
};
