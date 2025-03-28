"use client";

import Navbar from "@/components/Navbar";
import { useCart } from "@/context/CartContext";
import { Address, AddressApi } from "@/lib/api/address";
import { useMutation, useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { PiPencilSimple } from "react-icons/pi";
import Script from "next/script";
import { useSession } from "next-auth/react";
import { Order, orderApi } from "@/lib/api/orders";

const Checkout: React.FC = () => {
  const [selectedAddress, setSelectedAddress] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState("credit");
  const { cart } = useCart();

  const { data: session } = useSession();
  // Fetch addresses from API
  const { data: addresses } = useQuery({
    queryKey: ["address"],
    queryFn: async () => {
      const rawAddress = await AddressApi.getAddress();
      return rawAddress.map((addr: Address) => ({
        id: addr.id,
        name: "Home", // Static name for now
        details: `${addr.street}, ${addr.city}, ${addr.state}, ${addr.country} - ${addr.zipCode}`,
        street: addr.street,
        city: addr.city,
        state: addr.state,
        country: addr.country,
        zipCode: addr.zipCode,
      }));
    },
  });

  const router = useRouter();

  const getShiprocketToken = async () => {
    const email = process.env.NEXT_PUBLIC_SHIPROCKET_EMAIL;
    const password = process.env.NEXT_PUBLIC_SHIPROCKET_PASSWORD;
    try {
      const response = await fetch(
        "https://apiv2.shiprocket.in/v1/external/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
          }),
        }
      );

      const data = await response.json();
      return data.token;
    } catch (error) {
      console.error("Shiprocket Auth Error:", error);
      return null;
    }
  };

  const createShiprocketOrder = async (shipToken: string) => {
    try {
      const orderData = {
        order_id: ``, // Unique order ID
        order_date: new Date().toISOString(),
        pickup_location: "Primary",
        channel_id: "",
        comment: "New order",
        billing_customer_name: session?.user?.name,
        billing_address: addresses?.find((a) => a.id === selectedAddress)
          ?.details,
        billing_city: addresses?.find((a) => a.id === selectedAddress)?.city,
        billing_pincode: addresses?.find((a) => a.id === selectedAddress)
          ?.zipCode,
        billing_state: addresses?.find((a) => a.id === selectedAddress)?.state,
        billing_country: "India",
        billing_email: "",
        billing_phone: session?.user?.mobile_no,
        order_items: cart.map((item) => ({
          name: item.name,
          sku: item.productVariantId,
          units: item.quantity,
          selling_price: item.price,
          hsn: "1234",
        })),
        payment_method: paymentMethod === "cod" ? "COD" : "Prepaid",
        sub_total: subtotal,
        length: 10,
        breadth: 10,
        height: 10,
        weight: 1,
      };

      const response = await fetch(
        "https://apiv2.shiprocket.in/v1/external/orders/create/adhoc",
        {
          method: "POST",
          mode: "no-cors",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${shipToken}`,
          },
          body: JSON.stringify(orderData),
        }
      );

      const data = await response.json();
      console.log("Shiprocket Order Created:", data);
    } catch (error) {
      console.error("Shiprocket Order Error:", error);
    }
  };

  const handleSubmit = async () => {
    console.log("Selected Address:", selectedAddress);
    if (!selectAddress) {
      alert("Select an address first..");
    }
    if (!paymentMethod) {
      alert("Select a payment method first..");
    }
    if (paymentMethod === "cod") {
      orderMutaion.mutate({
        userId: session?.user?.id as string,
        addressId: selectedAddress,
        total,
        items: cart.map((item) => ({
          productVariantId: item.productVariantId as string,
          quantity: item.quantity,
          priceAtOrder: item.price,
        })),
      });
      const shipToken = await getShiprocketToken();
      createShiprocketOrder(shipToken as string);
      router.push("/profile");
    } else {
      // Razorpay will be here
      processPayment();
    }
  };

  const orderMutaion = useMutation({
    mutationFn: (order: Order) => {
      return orderApi.createOrder(order);
    },
    onSuccess: (data) => {
      console.log("Order Created:", data);
    },
    onError: (error) => {
      console.error("Error creating order:", error);
    },
  });

  // Sync selected address with fetched data
  useEffect(() => {
    if (addresses && addresses.length > 0 && !selectedAddress) {
      setSelectedAddress(addresses[0].id); // Only set default if no address is selected
    }
  }, [addresses, selectedAddress]);

  const selectAddress = (id: string) => {
    setSelectedAddress(id);
    // Optionally, update backend state if needed
    // AddressApi.updateSelectedAddress(id);
  };

  // Checkout calculations
  const subtotal =
    cart?.reduce((sum, item) => sum + item.price * item.quantity, 0) || 0;
  const shippingCharges = 149;
  const tax = subtotal * 0.18; // 18% tax
  const total = cart.length > 0 ? subtotal + shippingCharges + tax : 0;

  const createOrderId = async () => {
    try {
      const response = await fetch("/api/order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: total * 100,
        }),
      });

      if (!response.ok) {
        throw new Error("Network response was not ok");
      }

      const data = await response.json();
      return data.orderId;
    } catch (error) {
      console.error("There was a problem with your fetch operation:", error);
    }
  };

  const processPayment = async () => {
    try {
      const orderId: string = await createOrderId();
      const options = {
        key: process.env.RAZORPAY_KEY_ID,
        amount: total * 100,
        currency: "INR",
        name: "Arvan Footwear",
        description: "Arvan Footwear Order",
        order_id: orderId,

        handler: async function (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) {
          const data = {
            orderCreationId: orderId,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpayOrderId: response.razorpay_order_id,
            razorpaySignature: response.razorpay_signature,
          };

          const result = await fetch("/api/verify", {
            method: "POST",
            body: JSON.stringify(data),
            headers: { "Content-Type": "application/json" },
          });
          const res = await result.json();
          if (res.isOk) {
            orderMutaion.mutate(
              {
                userId: session?.user?.id as string,
                addressId: selectedAddress,
                total,
                paid: true,
                items: cart.map((item) => ({
                  productVariantId: item.productVariantId as string,
                  quantity: item.quantity,
                  priceAtOrder: item.price,
                })),
              },
              {
                onSuccess: async (data) => {
                  const orderId = data?.id;
                  console.log("Order Created with ID:", orderId);

                  // 🔥 Shiprocket Order
                  const shipToken = await getShiprocketToken();
                  if (!shipToken) {
                    console.error("Shiprocket token not found.");
                    return;
                  }

                  await createShiprocketOrder(shipToken);
                  router.push("/profile");
                },
                onError: (error) => {
                  console.error("Error creating order:", error);
                },
              }
            );
          } else {
            alert(res.message);
          }
        },
        prefill: {
          name: session?.user?.name,
          contact: session?.user?.mobile_no,
        },
        theme: {
          color: "#3399cc",
        },
      };
      const paymentObject = new window.Razorpay(options);
      paymentObject.on(
        "payment.failed",
        function (response: { error: { description: string } }) {
          alert(response.error.description);
        }
      );
      paymentObject.open();
    } catch (error) {
      console.log(error);
    }
  };
  return (
    <div className="min-h-screen bg-black text-white p-6 flex items-center justify-center">
      <Script
        id="razorpay-checkout-js"
        src="https://checkout.razorpay.com/v1/checkout.js"
      />
      <Navbar />

      <div className="container mx-auto max-w-6xl relative">
        {/* Blurred Background */}
        <div className="absolute w-[80vw] h-[40vw] rounded-full bg-lime-600/15 blur-3xl left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 -z-1"></div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-center relative z-10">
          {/* Left Section: Address & Payment Methods */}
          <div className="lg:col-span-2 space-y-6">
            {/* Delivery Address Section */}
            <div>
              <h2 className="text-4xl font-bold mb-4">Delivery To</h2>
              {/* {isLoading && <p>Loading addresses...</p>}
              {isError && <p>Error fetching addresses.</p>} */}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Address Cards */}
                {addresses &&
                  addresses.map((address) => (
                    <div
                      key={address.id}
                      className={`p-4 rounded-lg flex justify-between items-center cursor-pointer ${
                        selectedAddress === address.id
                          ? "border border-lime-400"
                          : "border-none"
                      }`}
                      style={{
                        backdropFilter: "blur(100px)",
                        backgroundColor: "rgba(255, 255, 255, 0.1)",
                      }}
                      onClick={() => selectAddress(address.id)}>
                      <div className="flex items-start space-x-2">
                        {selectedAddress === address.id && (
                          <div className="bg-lime-400 rounded-full p-1 mt-1">
                            <div className="h-2 w-2 rounded-full bg-white"></div>
                          </div>
                        )}
                        <div>
                          <h3 className="font-medium">{address.name}</h3>
                          <p className="text-gray-400 text-sm">
                            {address.details}
                          </p>
                        </div>
                      </div>
                      <button className="text-gray-200 hover:text-white">
                        <PiPencilSimple size={20} />
                      </button>
                    </div>
                  ))}

                {/* Add New Address Button */}
                <Link
                  href="/address"
                  className="p-4 rounded-lg bg-transparent border-2 border-lime-900 flex items-center justify-center cursor-pointer h-full"
                  style={{
                    backdropFilter: "blur(100px)",
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                  }}>
                  <span className="text-lime-400">Add New Address</span>
                </Link>
              </div>
            </div>

            {/* Payment Methods Section */}
            <div>
              <h2 className="text-4xl font-bold mb-4">Payment Methods</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {[
                  {
                    id: "upi",
                    label: "UPI (Unified Payments Interface)",
                    icon: "/upi.svg",
                  },
                  { id: "cod", label: "Cash On Delivery", icon: "/money.svg" },
                  { id: "credit", label: "Credit Card", icon: "/wallet.svg" },
                ].map(({ id, label, icon }) => (
                  <div
                    key={id}
                    className={`p-4 rounded-lg bg-[#6c8118] border flex justify-between items-center cursor-pointer ${
                      paymentMethod === id
                        ? "border-lime-400"
                        : "border-gray-800"
                    }`}
                    onClick={() => setPaymentMethod(id)}>
                    <div className="flex items-center">
                      <div className="bg-white p-2 rounded mr-3">
                        <Image src={icon} alt={label} width={40} height={40} />
                      </div>
                      <label htmlFor={`${id}-radio`} className="cursor-pointer">
                        {label}
                      </label>
                    </div>
                    <input
                      type="radio"
                      id={`${id}-radio`}
                      name="payment-method"
                      value={id}
                      checked={paymentMethod === id}
                      onChange={() => setPaymentMethod(id)}
                      className="w-5 h-5 accent-lime-500 appearance-none checked:bg-lime-400 checked:border-lime-800 border-2 border-lime-400 rounded-full"
                      aria-label={`Select ${label} payment method`}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Section: Order Summary */}
          <div className="lg:col-span-1">
            <div
              className="border-2 border-lime-500 rounded-lg lg:mt-5 p-6"
              style={{
                backdropFilter: "blur(100px)",
                backgroundColor: "rgba(255, 255, 255, 0.1)",
              }}>
              <h2 className="text-xl font-bold mb-6">Payment Details</h2>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-gray-300">Subtotal</span>
                  <span>₹{subtotal?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Shipping</span>
                  <span>₹{shippingCharges}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Tax (18%)</span>
                  <span>₹{tax?.toFixed(2)}</span>
                </div>
                <hr className="border-gray-600" />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span>₹{total?.toFixed(2)}</span>
                </div>
              </div>
              <button
                onClick={() => handleSubmit()}
                className="w-full mt-4 p-3 bg-lime-500 text-black font-bold rounded-lg">
                Proceed to Payment
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
