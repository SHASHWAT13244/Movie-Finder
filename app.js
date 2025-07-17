const API_KEY = ''; 
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w300';

// DOM elements
const searchInput = document.getElementById('searchInput');
const moviesContainer = document.getElementById('moviesContainer');
const genreFilter = document.getElementById('genreFilter');
const yearFilter = document.getElementById('yearFilter');
const sortBy = document.getElementById('sortBy');
const modal = document.getElementById('modal');
const modalContent = modal.querySelector('.modal-content');
const modalBody = document.getElementById('modalBody');
const modalClose = document.getElementById('modalClose');
const darkModeToggle = document.getElementById('darkModeToggle');
const trailerContainer = document.getElementById('trailerContainer');
const voiceBtn = document.getElementById('voiceBtn');
const viewFavoritesBtn = document.getElementById('viewFavoritesBtn');
const favoritesSection = document.getElementById('favoritesSection');
const favoritesContainer = document.getElementById('favoritesContainer');
const backToMainBtn = document.getElementById('backToMainBtn');
const mainContentSection = document.getElementById('mainContentSection');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageInfo = document.getElementById('pageInfo');
const prevPageBtnBottom = document.getElementById('prevPageBtnBottom');
const nextPageBtnBottom = document.getElementById('nextPageBtnBottom');
const pageInfoBottom = document.getElementById('pageInfoBottom');

// State variables
let currentQuery = '';
let currentPage = 1;
let totalPages = 1;
let isFetching = false;
let selectedGenre = '';
let selectedYear = '';
let sortOrder = 'popularity.desc';
let lastFocusedCard = null;

const favorites = new Set(JSON.parse(localStorage.getItem('favorites') || '[]'));
const genresMap = new Map();

// ======================
// Utility Functions
// ======================

function saveFavorites() {
  localStorage.setItem('favorites', JSON.stringify([...favorites]));
}

function toggleFavorite(movieId) {
  if (favorites.has(movieId)) favorites.delete(movieId);
  else favorites.add(movieId);
  saveFavorites();
  renderFavorites(); // Update favorites view in real-time
}

function applyDarkMode(enabled) {
  if (enabled) {
    document.body.classList.add('dark-mode');
    document.body.classList.remove('light-mode');
    darkModeToggle.textContent = '🌙';
  } else {
    document.body.classList.add('light-mode');
    document.body.classList.remove('dark-mode');
    darkModeToggle.textContent = '☀️';
  }
  localStorage.setItem('darkMode', enabled ? 'dark' : 'light');
}

function showSkeletonLoader(count = 10) {
  moviesContainer.innerHTML = `
    <div class="skeleton-container">
      ${Array(count).fill().map(() => `
        <div class="movie-card skeleton">
          <div class="skeleton-poster skeleton"></div>
          <div class="skeleton-text skeleton"></div>
          <div class="skeleton-text small skeleton"></div>
        </div>
      `).join('')}
    </div>
  `;
}

function updatePaginationControls() {
  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages || totalPages === 0;
  
  prevPageBtn.disabled = prevDisabled;
  nextPageBtn.disabled = nextDisabled;
  prevPageBtnBottom.disabled = prevDisabled;
  nextPageBtnBottom.disabled = nextDisabled;
  
  pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`;
  pageInfoBottom.textContent = `Page ${currentPage} of ${totalPages || 1}`;
}

// ======================
// Favorites Functions
// ======================

function renderFavorites() {
  if (favorites.size === 0) {
    favoritesContainer.innerHTML = '<p class="info-text">You have no favorite movies yet.</p>';
    return;
  }

  favoritesContainer.innerHTML = '';
  const favoritesArray = Array.from(favorites);
  
  // Fetch details for each favorite movie
  Promise.all(favoritesArray.map(movieId => fetchMovieDetails(movieId)))
    .then(movies => {
      movies.forEach(movie => {
        if (movie) {
          const card = createMovieCard(movie);
          favoritesContainer.appendChild(card);
        }
      });
    })
    .catch(() => {
      favoritesContainer.innerHTML = '<p class="info-text">Failed to load favorite movies.</p>';
    });
}

function showFavoritesView() {
  mainContentSection.classList.add('hidden');
  favoritesSection.classList.remove('hidden');
  renderFavorites();
}

function showMainView() {
  favoritesSection.classList.add('hidden');
  mainContentSection.classList.remove('hidden');
}

// ======================
// API Fetch Functions
// ======================

async function fetchGenres() {
  try {
    const res = await fetch(
      `${BASE_URL}/genre/movie/list?api_key=${API_KEY}&language=en-US`
    );
    const data = await res.json();
    if (data.genres) {
      genreFilter.innerHTML =
        `<option value="">All Genres</option>` +
        data.genres
          .map((g) => {
            genresMap.set(g.id, g.name);
            return `<option value="${g.id}">${g.name}</option>`;
          })
          .join('');
    }
  } catch {
    genreFilter.innerHTML = `<option value="">All Genres</option>`;
  }
}

async function fetchMovieDetails(movieId) {
  try {
    const res = await fetch(
      `${BASE_URL}/movie/${movieId}?api_key=${API_KEY}&language=en-US`
    );
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

async function fetchMovieTrailer(movieId) {
  try {
    const res = await fetch(
      `${BASE_URL}/movie/${movieId}/videos?api_key=${API_KEY}&language=en-US`
    );
    const data = await res.json();
    const trailer = data.results.find(
      (video) => video.site === 'YouTube' && video.type === 'Trailer'
    );
    return trailer ? trailer.key : null;
  } catch {
    return null;
  }
}

async function fetchMovies(page = 1) {
  if (isFetching || (totalPages && page > totalPages)) return;
  isFetching = true;
  moviesContainer.setAttribute('aria-busy', 'true');
  
  if (page === 1) showSkeletonLoader();

  try {
    let url = '';
    const params = new URLSearchParams({
      api_key: API_KEY,
      language: 'en-US',
      page,
      with_genres: selectedGenre,
      primary_release_year: selectedYear,
      sort_by: sortOrder
    });

    if (currentQuery.trim()) {
      params.set('query', currentQuery.trim());
      url = `${BASE_URL}/search/movie?${params.toString()}`;
    } else {
      url = `${BASE_URL}/discover/movie?${params.toString()}`;
    }

    const res = await fetch(url);
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      if (page === 1) {
        moviesContainer.innerHTML =
          `<p class="info-text">No movies found.</p>`;
      }
      totalPages = 0;
      updatePaginationControls();
      return;
    }

    totalPages = data.total_pages;
    if (page === 1) moviesContainer.innerHTML = '';

    data.results.forEach((movie) => {
      const card = createMovieCard(movie);
      moviesContainer.appendChild(card);
    });

    updatePaginationControls();
  } catch {
    if (page === 1) {
      moviesContainer.innerHTML =
        `<p class="info-text">Failed to load movies. Please try again later.</p>`;
    }
    totalPages = 0;
    updatePaginationControls();
  } finally {
    isFetching = false;
    moviesContainer.setAttribute('aria-busy', 'false');
  }
}

// ======================
// UI Functions
// ======================

function createMovieCard(movie) {
  const isFav = favorites.has(movie.id);
  const releaseYear = movie.release_date ? movie.release_date.slice(0, 4) : 'N/A';
  const posterUrl = movie.poster_path
    ? `${IMAGE_BASE_URL}${movie.poster_path}`
    : 'https://via.placeholder.com/300x450?text=No+Image';

  const card = document.createElement('article');
  card.className = 'movie-card';
  card.setAttribute('tabindex', '0');
  card.setAttribute(
    'aria-label',
    `${movie.title}, released in ${releaseYear}`
  );
  card.dataset.movieId = movie.id;

  card.innerHTML = `
    <button class="fav-btn" aria-label="${
      isFav ? 'Remove from favorites' : 'Add to favorites'
    }" title="Toggle Favorite">
      ${isFav ? '♥' : '♡'}
    </button>
    <img loading="lazy" src="${posterUrl}" alt="${movie.title} poster" class="movie-poster" />
    <div class="movie-info">
      <h3 class="movie-title">${movie.title}</h3>
      <p class="movie-meta">${releaseYear}</p>
    </div>
  `;

  const favBtn = card.querySelector('.fav-btn');
  favBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFavorite(movie.id);
    favBtn.textContent = favorites.has(movie.id) ? '♥' : '♡';
    favBtn.setAttribute(
      'aria-label',
      favorites.has(movie.id) ? 'Remove from favorites' : 'Add to favorites'
    );
    favBtn.classList.toggle('active', favorites.has(movie.id));
  });

  card.addEventListener('click', () => {
    lastFocusedCard = card;
    openModal(movie.id);
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      lastFocusedCard = card;
      openModal(movie.id);
    }
  });

  return card;
}

async function openModal(movieId) {
  modalBody.innerHTML = '<p class="info-text">Loading movie details...</p>';
  trailerContainer.innerHTML = '';
  
  modal.hidden = false;
  modal.classList.add('show');
  modalContent.focus();

  const [movie, trailerKey] = await Promise.all([
    fetchMovieDetails(movieId),
    fetchMovieTrailer(movieId),
  ]);

  if (!movie) {
    modalBody.innerHTML = '<p class="info-text">Failed to load movie details.</p>';
    return;
  }

  modalBody.innerHTML = `
    <h2 id="modalTitle">${movie.title}</h2>
    <img src="${
      movie.poster_path ? IMAGE_BASE_URL + movie.poster_path : 'https://via.placeholder.com/300x450?text=No+Image'
    }" alt="${movie.title} poster" />
    <p><strong>Release Date:</strong> ${movie.release_date || 'N/A'}</p>
    <p><strong>Genres:</strong> ${movie.genres.map((g) => g.name).join(', ') || 'N/A'}</p>
    <p><strong>Rating:</strong> ${movie.vote_average || 'N/A'} / 10</p>
    <p><strong>Overview:</strong> ${movie.overview || 'No overview available.'}</p>
  `;

  trailerContainer.innerHTML = trailerKey
    ? `<iframe src="https://www.youtube.com/embed/${trailerKey}?autoplay=0&controls=1" allowfullscreen></iframe>`
    : '<p class="info-text">No trailer available.</p>';

  trapFocus(modal);
}

function closeModal() {
  modal.classList.remove('show');
  modal.hidden = true;
  modalBody.innerHTML = '';
  trailerContainer.innerHTML = '';
  if (lastFocusedCard) lastFocusedCard.focus();
}

function trapFocus(element) {
  const focusableEls = element.querySelectorAll(
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
  );
  const firstFocusableEl = focusableEls[0];
  const lastFocusableEl = focusableEls[focusableEls.length - 1];
  element.addEventListener('keydown', function (e) {
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === firstFocusableEl) {
          e.preventDefault();
          lastFocusableEl.focus();
        }
      } else {
        if (document.activeElement === lastFocusableEl) {
          e.preventDefault();
          firstFocusableEl.focus();
        }
      }
    }
  });
}

function resetMoviesAndFetch() {
  currentPage = 1;
  totalPages = 1;
  moviesContainer.innerHTML = '';
  fetchMovies();
  updatePaginationControls();
}

// ======================
// Pagination Functions
// ======================

function goToPage(page) {
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  fetchMovies(currentPage);
}

// ======================
// Voice Search
// ======================

function setupVoiceSearch() {
  if (!('webkitSpeechRecognition' in window)) {
    voiceBtn.style.display = 'none';
    return;
  }

  const recognition = new webkitSpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;

  voiceBtn.addEventListener('click', () => {
    if (voiceBtn.classList.contains('listening')) {
      recognition.stop();
      return;
    }

    voiceBtn.classList.add('listening');
    recognition.start();
  });

  recognition.onstart = () => {
    searchInput.placeholder = 'Listening...';
  };

  recognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    searchInput.value = transcript;
    currentQuery = transcript;
    resetMoviesAndFetch();
  };

  recognition.onerror = (e) => {
    console.error('Voice recognition error', e.error);
  };

  recognition.onend = () => {
    voiceBtn.classList.remove('listening');
    searchInput.placeholder = 'Search movies...';
  };
}

// ======================
// Event Listeners
// ======================

darkModeToggle.addEventListener('click', () => {
  const isDark = document.body.classList.contains('dark-mode');
  applyDarkMode(!isDark);
});

genreFilter.addEventListener('change', () => {
  selectedGenre = genreFilter.value;
  resetMoviesAndFetch();
});

yearFilter.addEventListener('change', () => {
  selectedYear = yearFilter.value;
  resetMoviesAndFetch();
});

sortBy.addEventListener('change', () => {
  sortOrder = sortBy.value;
  resetMoviesAndFetch();
});

modalClose.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.hidden) closeModal();
});

let debounceTimeout = null;
searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(() => {
    currentQuery = searchInput.value.trim();
    resetMoviesAndFetch();
  }, 500);
});

viewFavoritesBtn.addEventListener('click', showFavoritesView);
backToMainBtn.addEventListener('click', showMainView);

prevPageBtn.addEventListener('click', () => goToPage(currentPage - 1));
nextPageBtn.addEventListener('click', () => goToPage(currentPage + 1));
prevPageBtnBottom.addEventListener('click', () => goToPage(currentPage - 1));
nextPageBtnBottom.addEventListener('click', () => goToPage(currentPage + 1));

window.addEventListener('scroll', () => {
  if (
    window.innerHeight + window.scrollY >=
      document.body.offsetHeight - 100 &&
    !isFetching &&
    currentPage < totalPages
  ) {
    currentPage++;
    fetchMovies(currentPage);
  }
});

// ======================
// Initialization
// ======================

(async function init() {
  // Set initial dark mode
  const savedMode = localStorage.getItem('darkMode');
  applyDarkMode(savedMode !== 'light');

  await fetchGenres();
  fillYearFilter();
  setupVoiceSearch();
  fetchMovies();
})();

function fillYearFilter() {
  const currentYear = new Date().getFullYear();
  let options = '<option value="">All Years</option>';
  for (let y = currentYear; y >= currentYear - 50; y--) {
    options += `<option value="${y}">${y}</option>`;
  }
  yearFilter.innerHTML = options;
}
