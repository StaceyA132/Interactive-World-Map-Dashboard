//
//  ContentView.swift
//  WorldMapDashboard
//
//  Created by Stacey A on 3/13/26.
//

import SwiftUI
struct ContentView: View {
    // Simulator only: on a physical device, use your Mac's LAN IP and run the server with HOST=0.0.0.0.
    private let dashboardURL = URL(string: "http://127.0.0.1:5050")!
    @State private var isLoading = true

    var body: some View {
        ZStack {
            WebDashboardView(url: dashboardURL, isLoading: $isLoading)
                .ignoresSafeArea()
            if isLoading {
                Color.black.opacity(0.25).ignoresSafeArea()
                ProgressView("Loading dashboard…")
                    .padding()
                    .background(.ultraThinMaterial)
                    .cornerRadius(12)
            }
        }
    }
}
