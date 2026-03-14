//
//  ContentView.swift
//  WorldMapDashboard
//
//  Created by Stacey A on 3/13/26.
//

import SwiftUI
struct ContentView: View {
    @State private var isLoading = true

    var body: some View {
        ZStack {
            WebDashboardView(url: URL(string: "http://127.0.0.1:5500")!, isLoading: $isLoading)
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
