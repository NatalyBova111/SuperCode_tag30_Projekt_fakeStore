// ============================================================================
// SuperFakeStore (Vite + TypeScript, простая версия на fetch().then())
// В этом файле:
//  - типы данных ответа API
//  - выбор DOM-элементов
//  - состояние приложения
//  - функции рендера (чипы категорий и карточки товаров)
//  - функция применения фильтров/сортировки
//  - инициализация: загрузка категорий и товаров
// ============================================================================

// ---- Типы ---------------------------------------------------------------
// Тип для товара из FakeStore API. Поля соответствуют документированным.
type Product = {
  id: number;                 // уникальный идентификатор товара
  title: string;              // название
  price: number;              // цена
  description: string;        // описание
  category: string;           // категория (electronics | jewelery | men's clothing | women's clothing)
  image: string;              // URL картинки
  rating?: {                  // рейтинг может отсутствовать, поэтому опционально
    rate: number;             // средняя оценка (0..5)
    count: number;            // количество оценок
  };
};

// Базовый адрес API. Все запросы строим относительно него.
const API = "https://fakestoreapi.com";

// ---- DOM (то, с чем работаем на странице) -------------------------------
// Элемент, куда пишем статусы загрузки/ошибок.
const statusEl = document.querySelector("#status") as HTMLDivElement;
// Контейнер-сетка для карточек товаров (сюда «рендерим» товары).
const grid = document.querySelector("#grid") as HTMLDivElement;

// Элементы панели фильтров.
const searchEl = document.querySelector("#search") as HTMLInputElement;        // поле поиска
const sortEl = document.querySelector("#sort") as HTMLSelectElement;           // селект сортировки
const catSelect = document.querySelector("#category") as HTMLSelectElement;    // скрытый селект: храним текущее значение категории
const chipsWrap = document.querySelector("#catChips") as HTMLDivElement;       // контейнер, куда рисуем «чипы» категорий

// ---- Состояние (данные в памяти) ----------------------------------------
// Полный список товаров, пришедший с API (не меняется после загрузки).
let allProducts: Product[] = [];
// Текущий «вью»-список после применения фильтров/сортировки (его и показываем).
let viewProducts: Product[] = [];

// ---- Вспомогательные функции --------------------------------------------

/**
 * Экранирует спецсимволы HTML в строке.
 * Зачем: мы вставляем название товара в innerHTML, и если в строке будут
 * символы < > & " ', браузер может воспринять их как HTML-разметку.
 * Эта функция превращает их в безопасные сущности (&lt; и т. д.),
 * чтобы строка отображалась как текст.
 */
function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m] as string)
  );
}

/**
 * Рендер карточек товаров в контейнер grid.
 * @param list - список товаров для отображения (после фильтров/сортировки)
 *
 * Алгоритм:
 * 1) Если список пуст — показываем заглушку «Нет результатов» и выходим.
 * 2) Иначе собираем HTML для каждой карточки и кладём его в grid.innerHTML.
 * 3) Назначаем обработчик на кнопку «Add to cart» (визуальное подтверждение).
 */
function renderProducts(list: Product[]) {
  // Guard/проверка: если ничего не найдено — не пытаемся строить сетку
  if (!list.length) {
    grid.innerHTML = `<p style="color:#666;margin:8px 0;">Keine Ergebnisse.</p>`;
    return;
  }

  // Собираем разметку для всех карточек (map → join).
  grid.innerHTML = list.map(p => `
    <article class="card">
      <div class="card__img">
        <img src="${p.image}" alt="${escapeHtml(p.title)}" />
      </div>

      <h3 class="card__title" title="${escapeHtml(p.title)}">
        ${escapeHtml(p.title)}
      </h3>

      <div class="card__meta">
        <span class="price">$ ${p.price.toFixed(2)}</span>
        <small>${p.rating ? `⭐ ${p.rating.rate} (${p.rating.count})` : ""}</small>
      </div>

      <button class="btn" data-add="${p.id}">Add to cart</button>
    </article>
  `).join("");

  // Простой отклик на «Add to cart» (без реальной корзины):
  // меняем текст кнопки на короткое время.
  grid.querySelectorAll<HTMLButtonElement>("[data-add]").forEach(btn => {
    btn.addEventListener("click", () => {
      const old = btn.textContent;
      btn.textContent = "Added!";
      btn.disabled = true;
      setTimeout(() => {
        btn.textContent = old || "Add to cart";
        btn.disabled = false;
      }, 900);
    });
  });
}

/**
 * Рендер «чипов» категорий (ряд кнопок на оранжевой панели).
 * @param categories - список строк категорий, пришедший с API
 *
 * Логика:
 * 1) Строим кнопку-чип для каждой категории и вставляем в #catChips.
 * 2) Назначаем клик: при выборе категории
 *    - записываем её значение в скрытый селект #category (центральное место хранения),
 *    - визуально выделяем активный чип,
 *    - вызываем applyFilters() — пересчитать и перерисовать список.
 * 3) По умолчанию активного чипа нет (это соответствует фильтру «all»).
 */
function renderCategoryChips(categories: string[]) {
  // Строим HTML кнопок из массива категорий
  chipsWrap.innerHTML = categories
    .map(c => `<button class="chip" data-cat="${c}">${c}</button>`)
    .join("");

  // Вспомогательная функция: подсветить активный чип
  const setActive = (cat: string | null) => {
    chipsWrap.querySelectorAll<HTMLButtonElement>(".chip").forEach(b => {
      b.classList.toggle("active", b.dataset.cat === cat);
    });
  };

  // Подписка на клик по каждому чипу
  chipsWrap.querySelectorAll<HTMLButtonElement>(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const cat = chip.dataset.cat!; // строка категории из data-атрибута
      catSelect.value = cat;         // прокидываем значение в скрытый селект (для единого источника истины)
      setActive(cat);                // визуально отмечаем активный чип
      applyFilters();                // пересчитать и перерисовать список товаров
    });
  });

  // По умолчанию — фильтр "all": активного чипа нет.
  setActive(null);
}

/**
 * Применяет все фильтры и сортировку к полному списку товаров (allProducts),
 * формирует viewProducts и вызывает рендер карточек.
 *
 * Фильтры:
 *  - категория (значение берём из скрытого селекта #category),
 *  - поиск по названию (поле #search).
 *
 * Сортировка:
 *  - relevance (ничего не делаем — оригинальный порядок),
 *  - price-asc / price-desc,
 *  - title-asc (по алфавиту).
 */
function applyFilters() {
  // Текущие значения фильтров из UI
  const q = searchEl.value.trim().toLowerCase();   // поисковая строка
  const cat = catSelect.value;                      // "all" или конкретная категория
  const sort = sortEl.value;                        // значение селекта сортировки

  // Начинаем с копии полного списка, чтобы не мутировать allProducts
  let list = allProducts.slice();

  // Фильтр по категории (если выбрана не «all»)
  if (cat !== "all") list = list.filter(p => p.category === cat);

  // Фильтр по названию (регистр игнорируем)
  if (q) list = list.filter(p => p.title.toLowerCase().includes(q));

  // Сортировка по выбранному критерию
  if (sort === "price-asc") {
    list.sort((a, b) => a.price - b.price);
  } else if (sort === "price-desc") {
    list.sort((a, b) => b.price - a.price);
  } else if (sort === "title-asc") {
    list.sort((a, b) => a.title.localeCompare(b.title));
  }
  // relevance — ничего не делаем: используем исходный порядок API

  // Сохраняем «вью»-список и перерисовываем карточки
  viewProducts = list;
  renderProducts(viewProducts);
}

// ---- Инициализация (загрузка данных и первый рендер) --------------------

// Сообщение пользователю: начинаем с загрузки категорий.
statusEl.textContent = "Loading categories…";

// 1) Сначала загружаем категории (нужны, чтобы отрисовать «чипы»)
fetch(`${API}/products/categories`)
  .then(res => res.json())
  .then((categories: string[]) => {
    // Заполняем скрытый селект списком категорий.
    // Почему селект скрытый? Нам нужно где-то централизованно хранить выбранную
    // категорию. Селект — удобный стандартный контрол, который можно читать/менять
    // и который не ломает верстку (мы его визуально прячем).
    catSelect.innerHTML = [
      `<option value="all">all</option>`,
      ...categories.map(c => `<option value="${c}">${c}</option>`)
    ].join("");

    // Рисуем чипы категорий (кнопки) во второй строке панели.
    renderCategoryChips(categories);

    // 2) После категорий — загружаем сами товары.
    statusEl.textContent = "Loading products…";
    return fetch(`${API}/products`);
  })
  .then(res => res.json())
  .then((products: Product[]) => {
    // Сохраняем товары в состояние и делаем первый рендер с фильтрами по умолчанию.
    allProducts = products;
    statusEl.textContent = "";
    applyFilters(); // фильтр категории = "all", сортировка = "relevance", поиск пустой
  })
  .catch(err => {
    // Если что-то пошло не так (сеть, недоступен API и т. п.):
    statusEl.textContent = String(err);
    console.error(err);
  });

// ---- Подписки на изменения UI -------------------------------------------
// Любая смена ввода пересчитывает список и перерисовывает карточки.
searchEl.addEventListener("input", applyFilters); // каждый ввод символа — новый поиск
sortEl.addEventListener("input", applyFilters);   // смена значения сортировки
