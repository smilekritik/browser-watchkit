#include "discord.hpp"

#include <algorithm>
#include <chrono>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <mutex>
#include <thread>

#include <fcntl.h>
#include <io.h>
#include <json.hpp>

namespace {
using nlohmann::json;
using namespace std::chrono_literals;

void send(const json& message)
{
    const auto payload = message.dump(-1, ' ', false, json::error_handler_t::replace);
    const auto length = static_cast<std::uint32_t>(payload.size());
    std::cout.write(reinterpret_cast<const char*>(&length), sizeof(length));
    std::cout.write(payload.data(), length).flush();
}

void report(const char* type)
{
    send(json{{"type", type}});
}

std::string string_field(const json& message, const char* key)
{
    const auto value = message.find(key);
    return value != message.end() && value->is_string() ? value->get<std::string>() : "";
}

void import_vlc_settings()
{
    const auto* local = _wgetenv(L"LOCALAPPDATA");
    if (!local) {
        send(json::object());
        return;
    }
    std::ifstream file(std::filesystem::path(local) / L"VLCAddon" / L"settings.json", std::ios::binary);
    const auto data = file ? json::parse(file, nullptr, false) : json{};
    send(data.is_object()
        ? json{{"applicationId", string_field(data, "application_id")}, {"image", string_field(data, "large_image")}}
        : json::object());
}

DWORD wait_time(const addon::Discord& discord)
{
    const auto deadline = discord.deadline();
    if (!deadline) return INFINITE;
    return static_cast<DWORD>(std::max(0ms, std::chrono::ceil<std::chrono::milliseconds>(
        *deadline - addon::Discord::Clock::now())).count());
}
}

int main()
{
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
    addon::Discord discord;
    const HANDLE input = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    if (!input || !discord.event()) {
        if (input) CloseHandle(input);
        return 1;
    }

    std::mutex mutex;
    json pending;
    bool finished = false;
    std::thread reader([&] {
        std::uint32_t length = 0;
        while (std::cin.read(reinterpret_cast<char*>(&length), sizeof(length)) && length <= 4096) {
            std::string payload(length, '\0');
            if (!std::cin.read(payload.data(), length)) break;
            auto message = json::parse(payload, nullptr, false);
            if (!message.is_object()) continue;
            const auto type = string_field(message, "type");
            if (type == "clear") break;
            if (type != "activity" && type != "import-vlc") continue;
            {
                std::lock_guard lock(mutex);
                pending = std::move(message);
            }
            SetEvent(input);
        }
        {
            std::lock_guard lock(mutex);
            finished = true;
        }
        SetEvent(input);
    });

    const HANDLE events[] = {input, discord.event()};
    std::string active_id;
    while (true) {
        const auto result = WaitForMultipleObjects(2, events, FALSE, wait_time(discord));
        if (result == WAIT_OBJECT_0) {
            json message;
            {
                std::lock_guard lock(mutex);
                if (finished) break;
                message = std::move(pending);
            }
            if (message.is_object()) {
                if (string_field(message, "type") == "import-vlc") {
                    import_vlc_settings();
                    continue;
                }
                auto id = string_field(message, "applicationId");
                auto title = string_field(message, "title");
                if (id.size() < 16 || id.size() > 20 || title.empty()
                    || !std::ranges::all_of(id, [](char c) { return c >= '0' && c <= '9'; })) {
                    report("rejected");
                } else {
                    active_id = id;
                    discord.update(std::move(id), addon::Activity{
                        std::move(title), string_field(message, "detail"), string_field(message, "image"),
                        string_field(message, "watchUrl")
                    });
                }
            }
        }
        discord.pump();
        if (discord.take_acknowledgement()) report("accepted");
        if (discord.take_rejection()) report("rejected");
    }
    discord.update(active_id, std::nullopt);
    reader.join();
    CloseHandle(input);
}
