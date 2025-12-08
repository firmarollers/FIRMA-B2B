// B2B Wholesale Integration for Shopify Storefront
// Compatible with Ritual Theme

(function() {
  'use strict';

  const B2B_API_BASE = window.location.origin + '/storefront-api';
  let customerEmail = null;
  let isB2BCustomer = false;
  let customerData = null;

  // Initialize on page load
  function init() {
    // Get customer email from Shopify
    getCustomerEmail();
    
    // Check if customer is B2B
    if (customerEmail) {
      checkB2BStatus();
    }

    // Monitor for dynamic content changes (for theme compatibility)
    observeDOMChanges();
  }

  // Get customer email from Shopify liquid variables or API
  function getCustomerEmail() {
    // Try to get from Shopify customer object (if logged in)
    if (typeof window.Shopify !== 'undefined' && window.Shopify.customer) {
      customerEmail = window.Shopify.customer.email;
    } else if (typeof ShopifyAnalytics !== 'undefined' && ShopifyAnalytics.meta.page.customerId) {
      // Customer is logged in but email not directly available
      // We'll fetch it
      fetchCustomerEmail();
    }
  }

  // Fetch customer email via AJAX
  async function fetchCustomerEmail() {
    try {
      const response = await fetch('/account', {
        headers: { 'Accept': 'application/json' }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.customer && data.customer.email) {
          customerEmail = data.customer.email;
          checkB2BStatus();
        }
      }
    } catch (error) {
      console.log('Could not fetch customer email');
    }
  }

  // Check if customer is B2B
  async function checkB2BStatus() {
    try {
      const response = await fetch(`${B2B_API_BASE}/customer-status?email=${encodeURIComponent(customerEmail)}`);
      const data = await response.json();

      isB2BCustomer = data.is_b2b;
      customerData = data.customer;

      if (isB2BCustomer) {
        applyB2BPricing();
        showB2BBadge();
        validateMinimumOrder();
      }
    } catch (error) {
      console.error('Error checking B2B status:', error);
    }
  }

  // Apply B2B pricing to product pages and collection pages
  async function applyB2BPricing() {
    // Find all price elements
    const priceElements = document.querySelectorAll('[data-product-price], .price, .product-price, [class*="price"]');

    for (const element of priceElements) {
      const priceText = element.textContent.trim();
      const priceMatch = priceText.match(/[\d,]+\.?\d*/);
      
      if (priceMatch) {
        const originalPrice = parseFloat(priceMatch[0].replace(',', ''));
        
        if (originalPrice > 0) {
          await updatePriceElement(element, originalPrice);
        }
      }
    }
  }

  // Update individual price element
  async function updatePriceElement(element, originalPrice) {
    try {
      const response = await fetch(`${B2B_API_BASE}/calculate-price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_email: customerEmail,
          original_price: originalPrice
        })
      });

      const data = await response.json();

      if (data.b2b_customer && data.final_price !== originalPrice) {
        // Create B2B price display
        const originalPriceFormatted = formatPrice(originalPrice);
        const finalPriceFormatted = formatPrice(data.final_price);
        const discountPercentage = data.discount;

        // Wrap original price in strikethrough
        element.innerHTML = `
          <span style="text-decoration: line-through; color: #999; font-size: 0.9em; margin-right: 8px;">
            ${originalPriceFormatted}
          </span>
          <span style="color: #d32f2f; font-weight: bold; font-size: 1.1em;">
            ${finalPriceFormatted}
          </span>
          <span style="display: inline-block; background: #d32f2f; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.75em; margin-left: 8px; font-weight: 600;">
            -${discountPercentage}% B2B
          </span>
        `;
      }
    } catch (error) {
      console.error('Error updating price:', error);
    }
  }

  // Show B2B badge
  function showB2BBadge() {
    if (document.querySelector('.b2b-customer-badge')) return;

    const badge = document.createElement('div');
    badge.className = 'b2b-customer-badge';
    badge.innerHTML = `
      <div style="
        position: fixed;
        top: 100px;
        right: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        animation: slideIn 0.3s ease-out;
      ">
        <div style="display: flex; align-items: center; gap: 10px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 7h-9m9 0v10a2 2 0 01-2 2H4m16-12l-4-4H4a2 2 0 00-2 2v16"></path>
          </svg>
          <div>
            <div style="font-weight: 600; font-size: 14px;">B2B Customer</div>
            <div style="font-size: 12px; opacity: 0.9;">${customerData.company_name}</div>
            <div style="font-size: 11px; opacity: 0.8; margin-top: 2px;">Wholesale Discount: ${customerData.discount_percentage}%</div>
          </div>
        </div>
      </div>
      <style>
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      </style>
    `;

    document.body.appendChild(badge);
  }

  // Validate minimum order on cart page
  function validateMinimumOrder() {
    if (window.location.pathname.includes('/cart')) {
      checkCartMinimum();
    }

    // Listen for cart updates
    document.addEventListener('cart:updated', checkCartMinimum);
  }

  // Check cart meets minimum requirements
  async function checkCartMinimum() {
    try {
      const cartResponse = await fetch('/cart.js');
      const cart = await cartResponse.json();

      const response = await fetch(`${B2B_API_BASE}/validate-cart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_email: customerEmail,
          total_amount: cart.total_price / 100
        })
      });

      const data = await response.json();

      if (data.is_b2b && !data.valid) {
        showCartWarning(data.errors);
        disableCheckoutButton();
      } else {
        removeCartWarning();
        enableCheckoutButton();
      }
    } catch (error) {
      console.error('Error validating cart:', error);
    }
  }

  // Show cart warning message
  function showCartWarning(errors) {
    removeCartWarning();

    const warning = document.createElement('div');
    warning.className = 'b2b-cart-warning';
    warning.innerHTML = `
      <div style="
        background: #fff3cd;
        border: 2px solid #ffc107;
        border-radius: 8px;
        padding: 16px;
        margin: 16px 0;
        color: #856404;
      ">
        <strong style="display: block; margin-bottom: 8px;">⚠️ Order Requirements Not Met</strong>
        ${errors.map(error => `<div>• ${error}</div>`).join('')}
      </div>
    `;

    const cartForm = document.querySelector('form[action="/cart"]') || document.querySelector('.cart');
    if (cartForm) {
      cartForm.insertBefore(warning, cartForm.firstChild);
    }
  }

  // Remove cart warning
  function removeCartWarning() {
    const warning = document.querySelector('.b2b-cart-warning');
    if (warning) warning.remove();
  }

  // Disable checkout button
  function disableCheckoutButton() {
    const checkoutButtons = document.querySelectorAll('[name="checkout"], .cart__checkout, button[type="submit"][name="checkout"]');
    checkoutButtons.forEach(button => {
      button.disabled = true;
      button.style.opacity = '0.5';
      button.style.cursor = 'not-allowed';
    });
  }

  // Enable checkout button
  function enableCheckoutButton() {
    const checkoutButtons = document.querySelectorAll('[name="checkout"], .cart__checkout, button[type="submit"][name="checkout"]');
    checkoutButtons.forEach(button => {
      button.disabled = false;
      button.style.opacity = '1';
      button.style.cursor = 'pointer';
    });
  }

  // Format price according to shop currency
  function formatPrice(price) {
    const currency = window.Shopify?.currency?.active || 'USD';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(price);
  }

  // Observe DOM changes for dynamic content (AJAX cart, quick view, etc.)
  function observeDOMChanges() {
    const observer = new MutationObserver((mutations) => {
      if (isB2BCustomer) {
        applyB2BPricing();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();