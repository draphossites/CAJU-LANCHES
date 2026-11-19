(() => {
  'use strict';

  const STORE_WHATSAPP = '5554996848117';
  const deliveryRegions = new Map([
    ['morro-tico-tico', { name: 'Morro Tico Tico', fee: 500 }],
    ['bom-fim-alto', { name: 'Bom Fim Alto', fee: 500 }],
    ['santa-terezinha', { name: 'Santa Terezinha', fee: 500 }],
    ['other', { name: 'Demais regiões', fee: 1000 }],
  ]);
  const STORAGE_KEY = 'caju-lanches-cart-v1';
  const MAX_QUANTITY = 99;
  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const productCards = [...document.querySelectorAll('.product-card[data-category]')];
  const products = new Map(productCards.map((card) => {
    const button = card.querySelector('[data-product]');
    return [button.dataset.product, {
      name: card.querySelector('h4').textContent.trim(),
      ingredients: card.querySelector('.product-ingredients').textContent.trim(),
      price: Number(card.dataset.price),
    }];
  }));

  const productDialog = document.querySelector('#product-dialog');
  const productContent = document.querySelector('#product-content');
  const cartDialog = document.querySelector('#cart-dialog');
  const cartContent = document.querySelector('#cart-content');
  const openCartButtons = document.querySelectorAll('[data-open-cart]');
  const cartCounts = document.querySelectorAll('[data-cart-count]');
  const siteStatus = document.querySelector('#site-status');
  const filters = document.querySelectorAll('[data-filter]');
  const menuCategories = document.querySelectorAll('[data-menu-category]');
  const requiredTextFields = ['customerName', 'street', 'streetNumber', 'neighborhood'];
  const checkoutDraft = Object.fromEntries([...requiredTextFields, 'fulfillment', 'deliveryRegion', 'notes'].map((name) => [name, '']));
  const cart = loadCart();
  let statusTimer;
  let clearStatusTimer;

  function formatPrice(cents) {
    return currency.format(cents / 100);
  }

  function escapeHtml(value) {
    const node = document.createElement('span');
    node.textContent = value;
    return node.innerHTML.replaceAll('"', '&quot;');
  }

  function loadCart() {
    const result = new Map();
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
      if (!Array.isArray(saved)) return result;
      for (const item of saved) {
        if (!item || !products.has(item.id) || !Number.isInteger(item.quantity) || item.quantity < 1) continue;
        const quantity = (result.get(item.id) ?? 0) + item.quantity;
        result.set(item.id, Math.min(quantity, MAX_QUANTITY));
      }
    } catch {
      // Um carrinho novo também funciona quando o navegador bloqueia o armazenamento.
    }
    return result;
  }

  function saveCart() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...cart].map(([id, quantity]) => ({ id, quantity }))));
    } catch {
      // A sacola permanece disponível durante a visita.
    }
    updateCartCount();
  }

  function updateCartCount() {
    const total = [...cart.values()].reduce((sum, quantity) => sum + quantity, 0);
    cartCounts.forEach((count) => { count.textContent = String(total); });
    openCartButtons.forEach((button) => {
      button.setAttribute('aria-label', `Abrir sacola, ${total} ${total === 1 ? 'item' : 'itens'}`);
    });
  }

  function announce(message) {
    clearTimeout(statusTimer);
    clearTimeout(clearStatusTimer);
    siteStatus.textContent = '';
    statusTimer = setTimeout(() => { siteStatus.textContent = message; }, 25);
    clearStatusTimer = setTimeout(() => { siteStatus.textContent = ''; }, 3500);
  }

  function dialogHeader(id, title, description = '') {
    return `
      <header class="dialog-header">
        <h2 class="dialog-title" id="${id}">${escapeHtml(title)}</h2>
        ${description ? `<p class="dialog-description">${escapeHtml(description)}</p>` : ''}
        <button class="dialog-close" type="button" data-close-dialog aria-label="Fechar">×</button>
      </header>`;
  }

  function quantityStepper(quantity, name, limit = MAX_QUANTITY) {
    const label = escapeHtml(name);
    return `
      <div class="quantity-stepper" role="group" aria-label="Quantidade de ${label}">
        <button type="button" data-quantity-change="-1" aria-label="Diminuir quantidade de ${label}" ${quantity <= 1 ? 'disabled' : ''}>−</button>
        <output aria-label="Quantidade" data-quantity>${quantity}</output>
        <button type="button" data-quantity-change="1" aria-label="Aumentar quantidade de ${label}" ${quantity >= limit ? 'disabled' : ''}>+</button>
      </div>`;
  }

  function openProduct(id) {
    const product = products.get(id);
    const limit = MAX_QUANTITY - (cart.get(id) ?? 0);
    if (!limit) {
      announce(`Sua sacola já tem ${MAX_QUANTITY} unidades deste lanche.`);
      return;
    }

    let quantity = 1;
    productContent.innerHTML = `
      ${dialogHeader('product-title', product.name, product.ingredients)}
      <form id="product-form">
        <div class="dialog-body">
          <div class="dialog-quantity">
            <span>Quantidade</span>
            ${quantityStepper(quantity, product.name, limit)}
          </div>
        </div>
        <div class="dialog-footer">
          <div class="dialog-total"><span>Subtotal</span><strong aria-live="polite" data-product-total>${formatPrice(product.price)}</strong></div>
          <button class="dialog-action btn btn-primary" type="submit">Adicionar à sacola</button>
        </div>
      </form>`;

    const form = productContent.querySelector('form');
    const quantityValue = form.querySelector('[data-quantity]');
    const decrement = form.querySelector('[data-quantity-change="-1"]');
    const increment = form.querySelector('[data-quantity-change="1"]');
    const total = form.querySelector('[data-product-total]');

    form.addEventListener('click', (event) => {
      const control = event.target.closest('[data-quantity-change]');
      if (!control) return;

      quantity = Math.min(limit, Math.max(1, quantity + Number(control.dataset.quantityChange)));
      quantityValue.value = String(quantity);
      decrement.disabled = quantity <= 1;
      increment.disabled = quantity >= limit;
      total.textContent = formatPrice(product.price * quantity);
      if (control.disabled) (control === decrement ? increment : decrement).focus();
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      cart.set(id, (cart.get(id) ?? 0) + quantity);
      saveCart();
      productDialog.close();
      announce(`${quantity} × ${product.name} na sacola.`);
    });

    productDialog.showModal();
  }

  function subtotal() {
    return [...cart].reduce((sum, [id, quantity]) => sum + products.get(id).price * quantity, 0);
  }

  function orderTotals(fulfillment, region) {
    const itemsSubtotal = subtotal();
    const fees = { delivery: deliveryRegions.get(region)?.fee, pickup: 0 };
    const deliveryFee = fees[fulfillment] ?? null;
    const total = deliveryFee === null ? null : itemsSubtotal + deliveryFee;
    return { itemsSubtotal, deliveryFee, total };
  }

  function formatOrderAmount(amount) {
    return amount === null ? '—' : formatPrice(amount);
  }

  function renderCart() {
    if (!cart.size) {
      cartContent.innerHTML = `
        ${dialogHeader('cart-title', 'Meu pedido')}
        <div class="dialog-body">
          <p class="cart-empty">Sua sacola está vazia.</p>
          <a class="btn btn-primary dialog-action" href="#cardapio" data-close-dialog>Ver cardápio</a>
        </div>`;
      return;
    }

    cartContent.innerHTML = `
      ${dialogHeader('cart-title', 'Meu pedido')}
      <div class="dialog-body">
        <ul class="cart-items">
          ${[...cart].map(([id, quantity]) => {
            const { name, price } = products.get(id);
            return `
              <li class="cart-item" data-cart-id="${escapeHtml(id)}">
                <div class="cart-item-info"><h3>${escapeHtml(name)}</h3><p class="cart-item-toppings">${formatPrice(price)} por unidade</p></div>
                <strong>${formatPrice(price * quantity)}</strong>
                <div class="cart-item-actions">
                  ${quantityStepper(quantity, name)}
                  <button type="button" class="cart-remove" data-remove aria-label="Remover ${escapeHtml(name)}">Remover</button>
                </div>
              </li>`;
          }).join('')}
        </ul>
      </div>
      <form id="checkout-form" class="checkout-form" aria-labelledby="checkout-title" novalidate>
        <div class="dialog-body">
          <h3 class="checkout-heading" id="checkout-title">Dados do pedido</h3>
          <label class="checkout-field">
            Nome do cliente
            <input type="text" name="customerName" autocomplete="name" maxlength="100" required>
          </label>
          <fieldset class="checkout-group">
            <legend>Tipo de recebimento</legend>
            <div class="checkout-options">
              <label class="checkout-option"><input type="radio" name="fulfillment" value="delivery" required> Entrega</label>
              <label class="checkout-option"><input type="radio" name="fulfillment" value="pickup" required> Retirada</label>
            </div>
          </fieldset>
          <fieldset class="checkout-group checkout-address" hidden disabled>
            <legend>Endereço de entrega</legend>
            <div class="checkout-address-grid">
              <label class="checkout-field">
                Rua
                <input type="text" name="street" autocomplete="address-line1" maxlength="120" required>
              </label>
              <label class="checkout-field">
                Número
                <input type="text" name="streetNumber" maxlength="24" required>
              </label>
              <div class="checkout-region">
                <label class="checkout-field">
                  Bairro ou região
                  <span class="checkout-select">
                    <select name="deliveryRegion" required>
                      <option value="" selected disabled>Selecione o bairro</option>
                      ${[...deliveryRegions].map(([id, { name, fee }]) => `<option value="${id}">${escapeHtml(name)} — ${formatPrice(fee)}</option>`).join('')}
                    </select>
                  </span>
                </label>
                <label class="checkout-field" data-other-neighborhood hidden>
                  Nome do bairro
                  <input type="text" name="neighborhood" autocomplete="address-level3" maxlength="80" required disabled>
                </label>
              </div>
            </div>
          </fieldset>
          <label class="checkout-field">
            <span>Observações <span class="checkout-optional">(opcional)</span></span>
            <textarea name="notes" rows="2" maxlength="300"></textarea>
          </label>
        </div>
        <div class="dialog-footer">
          <div class="checkout-totals" aria-live="polite" aria-atomic="true">
            <div class="dialog-total"><span>Subtotal dos lanches</span><strong>${formatPrice(subtotal())}</strong></div>
            <div class="dialog-total"><span>Taxa de entrega</span><strong data-checkout-fee>—</strong></div>
            <div class="dialog-total checkout-grand-total"><span>Total do pedido</span><strong data-checkout-total>—</strong></div>
          </div>
          <button class="dialog-action btn btn-primary" type="submit">Enviar pedido pelo WhatsApp</button>
          <p class="order-note">Revise a mensagem e confirme o envio no WhatsApp.</p>
          <button class="dialog-secondary btn btn-secondary" type="button" data-copy-order>Copiar pedido</button>
          <textarea class="order-summary" rows="4" aria-label="Resumo do pedido para copiar" data-copy-fallback readonly hidden></textarea>
          <p class="order-note" role="status" data-copy-status hidden></p>
        </div>
      </form>`;

    const form = cartContent.querySelector('form');
    for (const [name, value] of Object.entries(checkoutDraft)) {
      form.elements.namedItem(name).value = value;
    }
    updateCheckout(form);
  }

  function updateCheckout(form) {
    const { fulfillment, deliveryRegion } = checkoutDraft;
    const delivery = fulfillment === 'delivery';
    const askOtherNeighborhood = delivery && deliveryRegion === 'other';
    const address = form.querySelector('.checkout-address');
    const { deliveryFee, total } = orderTotals(fulfillment, deliveryRegion);

    address.hidden = !delivery;
    address.disabled = !delivery;
    form.querySelector('[data-other-neighborhood]').hidden = !askOtherNeighborhood;
    form.elements.namedItem('neighborhood').disabled = !askOtherNeighborhood;
    form.querySelector('[data-checkout-fee]').textContent = formatOrderAmount(deliveryFee);
    form.querySelector('[data-checkout-total]').textContent = formatOrderAmount(total);
  }

  function orderSummary() {
    const { customerName, fulfillment, street, streetNumber, deliveryRegion, neighborhood, notes } = checkoutDraft;
    const delivery = fulfillment === 'delivery';
    const { itemsSubtotal, deliveryFee, total } = orderTotals(fulfillment, deliveryRegion);
    const lines = [
      '*PEDIDO — CAJU LANCHES*',
      '',
      `*Nome do cliente:* ${customerName.trim()}`,
      `*Recebimento:* ${delivery ? 'Entrega' : 'Retirada'}`,
    ];
    if (delivery) {
      const neighborhoodName = deliveryRegion === 'other' ? neighborhood.trim() : deliveryRegions.get(deliveryRegion).name;
      lines.push(`*Endereço:* ${street.trim()}, ${streetNumber.trim()}`, `*Bairro:* ${neighborhoodName}`);
    }

    lines.push('', '*Itens do pedido*');
    for (const [id, quantity] of cart) {
      const { name, price } = products.get(id);
      lines.push(`• ${quantity} × ${name} (${formatPrice(price)} por unidade) — ${formatPrice(price * quantity)}`);
    }

    lines.push(
      '',
      `*Subtotal dos lanches:* ${formatPrice(itemsSubtotal)}`,
      `*Taxa de entrega:* ${formatOrderAmount(deliveryFee)}`,
      `*Total do pedido:* ${formatOrderAmount(total)}`,
    );
    if (notes.trim()) lines.push('', `*Observações:* ${notes.trim()}`);
    lines.push('', 'Podem confirmar o pedido?');
    return lines.join('\n');
  }

  function validateCheckout(form) {
    for (const name of Object.keys(checkoutDraft)) {
      checkoutDraft[name] = form.elements.namedItem(name).value;
    }
    updateCheckout(form);
    for (const name of requiredTextFields) {
      const field = form.elements.namedItem(name);
      field.setCustomValidity(field.value.trim() ? '' : 'Preencha este campo.');
    }
    return form.reportValidity();
  }

  async function copyOrder(form) {
    const summary = orderSummary();
    const field = form.querySelector('[data-copy-fallback]');
    const status = form.querySelector('[data-copy-status]');

    try {
      await navigator.clipboard.writeText(summary);
      field.hidden = true;
      status.textContent = 'Pedido copiado.';
    } catch {
      field.value = summary;
      field.hidden = false;
      field.focus();
      field.select();
      status.textContent = 'Selecione e copie o resumo do seu pedido.';
    }
    status.hidden = false;
  }

  productCards.forEach((card) => {
    const button = card.querySelector('[data-product]');
    button.addEventListener('click', () => openProduct(button.dataset.product));
  });

  openCartButtons.forEach((button) => {
    button.addEventListener('click', () => {
      renderCart();
      cartDialog.showModal();
    });
  });

  const headerCart = document.querySelector('.site-header [data-open-cart]');
  const floatingCart = document.querySelector('.floating-cart');
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      floatingCart.hidden = entry.intersectionRatio === 1;
    }, { threshold: 1 }).observe(headerCart);
  } else {
    floatingCart.hidden = false;
  }

  [productDialog, cartDialog].forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog || event.target.closest('[data-close-dialog]')) dialog.close();
    });
  });

  cartContent.addEventListener('input', (event) => {
    const field = event.target;
    if (!Object.hasOwn(checkoutDraft, field.name)) return;
    checkoutDraft[field.name] = field.value;
    field.setCustomValidity('');
    if (field.name === 'fulfillment' || field.name === 'deliveryRegion') updateCheckout(field.form);
    field.form.querySelector('[data-copy-fallback]').hidden = true;
    field.form.querySelector('[data-copy-status]').hidden = true;
  });

  cartContent.addEventListener('submit', (event) => {
    if (event.target.id !== 'checkout-form') return;
    event.preventDefault();
    if (!cart.size || !validateCheckout(event.target)) return;

    const text = encodeURIComponent(orderSummary());
    window.open(`https://wa.me/${STORE_WHATSAPP}?text=${text}`, '_blank', 'noopener,noreferrer');
  });

  cartContent.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;

    if (button.hasAttribute('data-copy-order')) {
      if (validateCheckout(button.form)) void copyOrder(button.form);
      return;
    }

    const row = button.closest('[data-cart-id]');
    if (!row) return;
    const { cartId } = row.dataset;

    if (button.hasAttribute('data-remove')) {
      const previousIndex = [...cart.keys()].indexOf(cartId);
      cart.delete(cartId);
      saveCart();
      renderCart();
      const remaining = cartContent.querySelectorAll('[data-remove]');
      const next = remaining[Math.min(previousIndex, remaining.length - 1)] ?? cartContent.querySelector('.cart-empty + a');
      next?.focus();
      return;
    }

    const { quantityChange } = button.dataset;
    if (!quantityChange) return;
    const quantity = Math.min(MAX_QUANTITY, Math.max(1, cart.get(cartId) + Number(quantityChange)));
    cart.set(cartId, quantity);
    saveCart();
    renderCart();
    const newRow = [...cartContent.querySelectorAll('[data-cart-id]')].find((item) => item.dataset.cartId === cartId);
    const controls = [...newRow.querySelectorAll('[data-quantity-change]:enabled')];
    const next = controls.find((control) => control.dataset.quantityChange === quantityChange) ?? controls[0];
    next?.focus({ preventScroll: true });
  });

  filters.forEach((button) => {
    button.addEventListener('click', () => {
      const category = button.dataset.filter;
      filters.forEach((filter) => {
        const active = filter === button;
        filter.setAttribute('aria-pressed', String(active));
      });
      menuCategories.forEach((section) => {
        section.hidden = category !== 'all' && section.dataset.menuCategory !== category;
      });
    });
  });

  document.querySelectorAll('[data-store-contact]').forEach((contact) => {
    contact.href = `https://wa.me/${STORE_WHATSAPP}`;
  });
  updateCartCount();
})();
